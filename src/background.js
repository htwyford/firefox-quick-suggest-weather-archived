/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const URLBAR_PROVIDER_NAME = "weather-result";
const DYNAMIC_TYPE_NAME = "dynamicWeather";

/**
 * If true, use dummy data. Before setting this to false, create
 * src/secret_keys.js and populate it with:
 * const ACCUWEATHER_SECRET_KEY = "<AccuWeather API key>";
 */
const TESTING_MODE = true;
const TEST_CURRENT_JSON = JSON.parse(
  `[{"LocalObservationDateTime":"2020-11-16T14:28:00-05:00","EpochTime":1605554880,"WeatherText":"Cloudy","WeatherIcon":7,"HasPrecipitation":false,"PrecipitationType":null,"IsDayTime":true,"Temperature":{"Metric":{"Value":3.9,"Unit":"C","UnitType":17},"Imperial":{"Value":39,"Unit":"F","UnitType":18}},"MobileLink":"http://m.accuweather.com/en/ca/waterfront-communities/m5j/current-weather/3393497?lang=en-us","Link":"http://www.accuweather.com/en/ca/waterfront-communities/m5j/current-weather/3393497?lang=en-us"}]`
);
const TEST_LOCATION_JSON = JSON.parse(
  `{"Version":1,"Key":"3393497","Type":"City","Rank":55,"LocalizedName":"Waterfront Communities","EnglishName":"Waterfront Communities","PrimaryPostalCode":"M5J","Region":{"ID":"NAM","LocalizedName":"North America","EnglishName":"North America"},"Country":{"ID":"CA","LocalizedName":"Canada","EnglishName":"Canada"},"AdministrativeArea":{"ID":"ON","LocalizedName":"Ontario","EnglishName":"Ontario","Level":1,"LocalizedType":"Province","EnglishType":"Province","CountryID":"CA"},"TimeZone":{"Code":"EST","Name":"America/Toronto","GmtOffset":-5,"IsDaylightSaving":false,"NextOffsetChange":"2021-03-14T07:00:00Z"},"GeoPosition":{"Latitude":43.645,"Longitude":-79.379,"Elevation":{"Metric":{"Value":81,"Unit":"m","UnitType":5},"Imperial":{"Value":265,"Unit":"ft","UnitType":0}}},"IsAlias":false,"ParentCity":{"Key":"55488","LocalizedName":"Toronto","EnglishName":"Toronto"},"SupplementalAdminAreas":[{"Level":2,"LocalizedName":"Toronto","EnglishName":"Toronto"}],"DataSets":["AirQualityCurrentConditions","AirQualityForecasts","Alerts","ForecastConfidence","FutureRadar","MinuteCast","Radar"]}`
);

// By default, data expire after 10 minutes.
const DEFAULT_EXPIRY = 1000 * 60 * 10;

class CachedWeatherResult {
  constructor(current, location, expiry = Date.now() + DEFAULT_EXPIRY) {
    this._currentData = current;
    this._locationData = location;
    this._expiryTime = expiry;
  }

  /**
   * Returns the current weather. AccuWeather returns current weather as a
   * single-element array, so the first element of the array is returned.
   */
  get current() {
    return this._currentData?.[0];
  }

  /**
   * Returns information about the location requested.
   */
  get location() {
    return this._locationData;
  }

  isExpired() {
    if (TESTING_MODE) {
      return false;
    }

    return Date.now > this._expiryTime;
  }
}

/**
 *  Key {string}
 *    Location query. e.g., "nyc", "berlin".
 *  Value {CachedWeatherResult}
 */
let cachedWeatherResults = new Map();

/**
 * A map of location names that did not return results and at which time that
 * location was searched. We keep track of this to avoid hammering AccuWeather's
 * servers with repeated requests for bogus locations. We keep track of the time
 * in case no data was returned to due to server outages or if the user's
 * internet is down.
 *
 * Key {string}
 *   Location query. e.g., "nyc", "berlin".
 * Value {Date}
 *   The time at which the request returned no results.
 */
let invalidLocations = new Map();

// Our provider.
class ProviderDynamicWeatherTest extends UrlbarProvider {
  constructor() {
    super();

    let daysOfWeek = [];
    for (let day = 0; day < 5; day++) {
      daysOfWeek.push({
        name: `day${day}`,
        tag: "div",
        children: [
          {
            name: `dayOfWeek${day}`,
            tag: "span",
          },
          {
            name: `dayIcon${day}`,
            tag: "img",
          },
          {
            name: `dayTemperature${day}`,
            tag: "span",
          },
        ],
      });
    }

    // Register our dynamic result type.
    UrlbarResult.addDynamicResultType(DYNAMIC_TYPE_NAME);
    UrlbarView.addDynamicViewTemplate(DYNAMIC_TYPE_NAME, {
      stylesheet: "data/style.css",
      attributes: {
        role: "group",
        selectable: true,
      },
      children: [
        {
          name: "info",
          tag: "div",
          children: [
            {
              name: "location",
              tag: "span",
            },
            {
              name: "forecastTime",
              tag: "span",
            },
            {
              name: "currentConditions",
              tag: "span",
            },
            {
              name: "provider",
              tag: "span",
            },
          ],
        },
        {
          name: "current",
          tag: "div",
          children: [
            {
              name: "currentIcon",
              tag: "img",
            },
            {
              name: "currentTemperature",
              tag: "span",
            },
            {
              name: "currentUnits",
              tag: "span",
            },
          ],
        },
        {
          name: "daysContainer",
          tag: "div",
          children: daysOfWeek,
        },
      ],
    });
  }

  get name() {
    return "ProviderDynamicWeatherTest";
  }

  getPriority(queryContext) {
    return 0;
  }

  async isActive(queryContext) {
    let queryInstance = {};
    this.queryInstance = queryInstance;
    this._currentLocationString = this._getLocationString(
      queryContext.searchString
    );
    if (this._currentLocationString.length < 3) {
      // The intial experimental version of this add-on does not record or send
      // user location data. We only support explicit requests for place-names;
      // e.g. "weather in toronto" or "nyc forecast".
      // We also don't hit the APIs if the user types just one or two characters.
      return false;
    }

    this._currentLocationString = this._getLocationString(
      queryContext.searchString
    );
    let cachedResult = cachedWeatherResults.get(this._currentLocationString);
    if (!cachedResult || cachedResult.isExpired()) {
      // We need to refresh the cache.
      cachedWeatherResults.delete(this._currentLocationString);

      // Do not fetch data if this query recently failed to return results.
      let timedOutDate = invalidLocations.get(this._currentLocationString);
      if (timedOutDate && timedOutDate < Date.now() + DEFAULT_EXPIRY) {
        return false;
      }
      invalidLocations.delete(this._currentLocationString);

      let locationResponse = await this.getLocationDataFromQuery(
        this._currentLocationString
      );
      if (!locationResponse) {
        invalidLocations.set(this._currentLocationString, Date.now());
        return false;
      }
      if (this.queryInstance != queryInstance) {
        return false;
      }

      let data = await this.getWeatherData(locationResponse);
      if (!data) {
        invalidLocations.set(this._currentLocationString, Date.now());
        return false;
      }
      if (this.queryInstance != queryInstance) {
        return false;
      }
      cachedWeatherResults.set(this._currentLocationString, data);
    }

    return true;
  }

  // Updates the result's view.
  getViewUpdate(result) {
    let viewUpdate = {
      location: {
        textContent: result.payload.locationName,
      },
      forecastTime: {
        textContent: result.payload.forecastTime,
      },
      currentConditions: {
        textContent: result.payload.current.conditions,
      },
      provider: {
        textContent: result.payload.providerName,
      },
      currentIcon: {
        attributes: {
          src: result.payload.current.icon,
        },
      },
      currentTemperature: {
        textContent: result.payload.current.temperature,
      },
      currentUnits: {
        textContent: result.payload.units,
      },
    };

    for (let day = 0; day < 5; day++) {
      if (!result.payload.daily[day]) {
        viewUpdate[`day${day}`] = {
          style: {
            display: "none",
          },
        };
        continue;
      }
      viewUpdate[`dayOfWeek${day}`] = {
        textContent: result.payload.daily[day].dayOfWeek,
      };
      viewUpdate[`dayIcon${day}`] = {
        attributes: {
          src: result.payload.daily[day].icon,
        },
      };
      viewUpdate[`dayTemperature${day}`] = {
        textContent:
          result.payload.daily[day].temperatureHigh +
          "° / " +
          result.payload.daily[day].temperatureLow +
          "°",
      };
    }

    return viewUpdate;
  }

  async startQuery(queryContext, addCallback) {
    let data = cachedWeatherResults.get(this._currentLocationString);

    if (!data) {
      return;
    }

    const longDateFormatter = new Intl.DateTimeFormat("default", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZone: data.location.TimeZone.Name,
    });

    const dayOfWeekFormatter = new Intl.DateTimeFormat("default", {
      weekday: "short",
      timeZone: data.location.TimeZone.Name,
    });

    // The API returns a number representing an icon. Accessing the icon via
    // URL requires padding zeroes.
    let iconNumber = data.current.WeatherIcon.toString().padStart(2, "0");
    let result = new UrlbarResult(
      UrlbarUtils.RESULT_TYPE.DYNAMIC,
      UrlbarUtils.RESULT_SOURCE.OTHER_NETWORK,
      {
        url: data.current.Link,
        providerName: "Data Provided by AccuWeather",
        locationName: data.location.LocalizedName,
        // Convert UNIX time in seconds to milliseconds for the Date() object.
        forecastTime: longDateFormatter.format(data.current.EpochTime * 1000),
        units: `°${
          this._isMetric(data.location)
            ? data.current.Temperature.Metric.Unit
            : data.current.Temperature.Imperial.Unit
        }`,
        current: {
          conditions: data.current.WeatherText,
          // TODO: Store these icons locally.
          icon: `https://developer.accuweather.com/sites/default/files/${iconNumber}-s.png`,
          temperature: Math.round(
            this._isMetric(data.location)
              ? data.current.Temperature.Metric.Value
              : data.current.Temperature.Imperial.Value
          ),
        },
        dynamicType: DYNAMIC_TYPE_NAME,
      }
    );
    result.suggestedIndex = 1;
    addCallback(this, result);
  }

  cancelQuery(queryContext) {}

  pickResult(result) {
    browser.tabs.create({ url: result.payload.url });
  }

  /**
   * Fetches and caches weather data from AccuWeather.
   *
   * @param {object} locationData
   *   JSON data from the AccuWeather Geoposition API. See
   *   getLocationDataFromQuery.
   * @returns {Promise}
   *   Resolves to AccuWeather weather data for the given location key.
   */
  async getWeatherData(locationData) {
    if (TESTING_MODE) {
      return new CachedWeatherResult(TEST_CURRENT_JSON, locationData);
    }

    const locationKey = locationData?.Key;
    if (!locationKey) {
      return null;
    }

    const url = new URL("https://apidev.accuweather.com");
    // First, fetch current weather data.
    url.pathname = `currentconditions/v1/${locationKey}.json`;
    // eslint-disable-next-line no-undef
    url.searchParams.append("apikey", ACCUWEATHER_SECRET_KEY);

    const response = await fetch(url);
    if (!response || !response.ok) {
      return null;
    }
    const currentJson = await response.json();
    const expiryHeader = response.headers.get("Expiry");
    let expiry = expiryHeader ? new Date(expiryHeader) : null;

    return new CachedWeatherResult(currentJson, locationData, expiry);
  }

  /**
   * @param {string} query
   *   A string describing a location. e.g. "Toronto"; "Paris France".
   * @returns {Promise}
   *   Resolves to an Object: {latitude, longitude, locality}
   */
  async getLocationDataFromQuery(query) {
    if (TESTING_MODE) {
      return TEST_LOCATION_JSON;
    }

    const url = new URL("https://apidev.accuweather.com");
    url.pathname = `locations/v1/search.json`;
    url.searchParams.append("q", query);
    // eslint-disable-next-line no-undef
    url.searchParams.append("apikey", ACCUWEATHER_SECRET_KEY);

    const response = await fetch(url);
    if (!response || !response.ok) {
      return null;
    }
    const json = await response.json();

    // TODO: Filter the returned locations to sort by proximity to the user
    // instead of AccuWeather's "rank".
    return json?.[0];
  }

  /**
   * Returns a location that the user is searching for. The return value is used
   * to get and set values in the cache.
   * TODO: Make this significantly more flexible. Consider using the
   *   Interventions QueryScorer.
   *
   * @param {string} searchString
   *   The query typed by the user.
   * @returns {string}
   *   The location the user is searching for. For example, "weather in berlin"
   *   returns "berlin". If no location is detected, the empty string is returned.
   */
  _getLocationString(searchString) {
    if (searchString.endsWith(" weather")) {
      return searchString.slice(0, searchString.indexOf(" weather"));
    } else if (searchString.endsWith(" forecast")) {
      return searchString.slice(0, searchString.indexOf(" forecast"));
    } else if (
      searchString.includes("weather in") ||
      searchString.includes("weather at")
    ) {
      return searchString
        .slice(
          // 7: "weather".length
          // 3: " at"/" in".length
          searchString.indexOf("weather") + 7 + 3
        )
        .trim();
    }

    return "";
  }

  /**
   *
   * @param {object} locationData
   *   JSON data from the AccuWeather Geoposition API. See
   *   getLocationDataFromQuery.
   * @returns {boolean}
   *   True if the location represented in the data uses Metric units.
   */
  _isMetric(locationData) {
    if (!locationData) {
      return true;
    }

    return locationData.Country.ID != "US";
  }
}

let testProvider;
(async function main() {
  testProvider = new ProviderDynamicWeatherTest();
  addProvider(testProvider);
})();

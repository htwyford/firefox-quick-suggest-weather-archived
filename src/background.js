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

/**
 * AccuWeather returns a number 1-44 representing a weather condition. ICON_MAP
 * maps these numbers to the name of an SVG file depicting the associated
 * condition. The comments to the right are AccuWeather's description
 * of that icon number.
 *
 * AccuWeather's map of icon numbers to icons is available in their API
 * documentation: https://apidev.accuweather.com/developers/weatherIcons.
 *
 * We ignore prettier for this object to allow for the spaces before the
 * comments.
 */
// prettier-ignore
const ICON_MAP = {
  1: "day-sunny.svg",             // Sunny
  2: "day-sunny-overcast.svg",    // Mostly Sunny
  3: "day-cloudy.svg",            // Partly Sunny
  4: "day-sunny-overcast.svg",    // Intermittent Clouds
  5: "day-haze.svg",              // Hazy Sunshine
  6: "day-cloudy.svg",            // Mostly Cloudy
  7: "cloudy.svg",                // Cloudy
  8: "cloudy.svg",                // Dreary (Overcast)
  // 9 is unassigned.
  // 10 is unassigned.
  11: "fog.svg",                  // Fog
  12: "showers.svg",              // Showers
  13: "day-showers.svg",          // Mostly Cloudy w/ Showers
  14: "day-showers.svg",          // Partly Sunny w/ Showers
  15: "thunderstorm.svg",         // T-Storms
  16: "day-thunderstorm.svg",     // Mostly Cloudy w/ T-Storms
  17: "day-thunderstorm.svg",     // Partly Sunny w/ T-Storms
  18: "rain.svg",                 // Rain
  19: "snow-wind.svg",            // Flurries
  20: "day-snow-wind.svg",        // Mostly Cloudy w/ Flurries
  21: "day-snow-wind.svg",        // Partly Sunny w/ Flurries
  22: "snow.svg",                 // Snow
  23: "day-snow.svg",             // Mostly Cloudy w/ Snow
  24: "snowflake-cold.svg",       // Ice
  25: "sleet.svg",                // Sleet
  26: "rain-mix.svg",             // Freezing Rain
  // 27 is unassigned.
  // 28 is unassigned.
  29: "rain-mix.svg",             // Rain and Snow
  30: "hot.svg",                  // Hot
  31: "snowflake-cold.svg",       // Cold
  32: "strong-wind.svg",          // Windy
  33: "night-clear.svg",          // Clear (Night)
  34: "night-partly-cloudy.svg",  // Mostly Clear (Night)
  35: "night-partly-cloudy.svg",  // Partly Cloudy (Night)
  36: "night-partly-cloudy.svg",  // Intermittent Clouds (Night)
  37: "night-fog.svg",            // Hazy Moonlight (Night)
  38: "night-cloudy.svg",         // Mostly Cloudy (Night)
  39: "night-showers.svg",        // Partly Cloudy w/ Showers (Night)
  40: "night-showers.svg",        // Mostly Cloudy w/ Showers (Night)
  41: "night-thunderstorm.svg",   // Partly Cloudy w/ T-Storms (Night)
  42: "night-thunderstorm.svg",   // Mostly Cloudy w/ T-Storms (Night)
  43: "night-snow-wind.svg",      // Mostly Cloudy w/ Flurries (Night)
  44: "night-snow.svg",           // Mostly Cloudy w/ Snow (Night)
};

const DEFAULT_ICON = "thermometer.svg";

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
          name: "noWrap",
          tag: "span",
          classList: ["urlbarView-no-wrap"],
          children: [
            {
              name: "icon",
              tag: "img",
              classList: ["urlbarView-icon"],
            },
            {
              name: "textContent",
              tag: "div",
              children: [
                {
                  name: "title",
                  // We set this in <strong> tags as "fake" title highlighting.
                  // We don't actually autocomplete any part of the title
                  // but we want visual consistency with other results, so we
                  // bold it as if it is autocompleted.
                  tag: "strong",
                  classList: ["urlbarView-title"],
                },
                {
                  name: "weatherInfo",
                  tag: "span",
                  children: [
                    {
                      name: "currentTemperature",
                      tag: "span",
                    },
                    {
                      name: "forecastDay",
                      tag: "span",
                    },
                    {
                      name: "separator",
                      tag: "span",
                      classList: ["urlbarView-title-separator"],
                    },
                    {
                      name: "location",
                      tag: "span",
                    },
                  ],
                },
              ],
            },
          ],
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
      title: {
        textContent: result.payload.title,
      },
      currentTemperature: {
        textContent: `${result.payload.current.temperature}${result.payload.units} `,
      },
      forecastDay: {
        textContent: result.payload.forecastDay,
      },
      location: {
        // TODO: When this is localized to non-EN regions, we will need to
        // review how punctuation is handled here.
        textContent: `${result.payload.cityName}, ${result.payload.adminAreaCode}`,
      },
      icon: {
        attributes: {
          src: result.payload.icon,
          alt: result.payload.iconDescription,
        },
      },
    };

    return viewUpdate;
  }

  async startQuery(queryContext, addCallback) {
    let data = cachedWeatherResults.get(this._currentLocationString);

    if (!data) {
      return;
    }

    const dayOfWeekFormatter = new Intl.DateTimeFormat("default", {
      weekday: "long",
      timeZone: data.location.TimeZone.Name,
    });

    let iconName = `icons/${ICON_MAP[data.current.WeatherIcon] ||
      DEFAULT_ICON}`;
    let icon = browser.runtime.getURL(iconName);
    let result = new UrlbarResult(
      UrlbarUtils.RESULT_TYPE.DYNAMIC,
      UrlbarUtils.RESULT_SOURCE.OTHER_NETWORK,
      {
        title: queryContext.searchString,
        icon,
        iconDescription: data.current.WeatherText,
        url: data.current.Link,
        cityName: data.location.LocalizedName,
        // We show the state code for locations in the United States and the
        // country code for all other places.
        adminAreaCode:
          data.location.Country.ID == "US"
            ? data.location.AdministrativeArea.ID
            : data.location.AdministrativeArea.CountryID,
        // Convert UNIX time in seconds to milliseconds for the Date() object.
        forecastDay: dayOfWeekFormatter.format(data.current.EpochTime * 1000),
        units: `°${
          this._isMetric(data.location)
            ? data.current.Temperature.Metric.Unit
            : data.current.Temperature.Imperial.Unit
        }`,
        current: {
          temperature: Math.round(
            this._isMetric(data.location)
              ? data.current.Temperature.Metric.Value
              : data.current.Temperature.Imperial.Value
          ),
        },
        dynamicType: DYNAMIC_TYPE_NAME,
      }
    );
    result.suggestedIndex = queryContext.maxResults - 1;
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

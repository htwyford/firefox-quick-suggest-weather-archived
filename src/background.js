/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const URLBAR_PROVIDER_NAME = "weather-result";
const DYNAMIC_TYPE_NAME = "dynamicWeather";

/**
 * Logs a debug message, which the test harness interprets as a message the
 * add-on is sending to the test.  See head.js for info.
 *
 * @param {string} msg
 *   The message.
 */
function sendTestMessage(msg) {
  console.debug(browser.runtime.id, msg);
}

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

class CachedWeatherData {
  constructor(weatherData, location, expiry = Date.now() + DEFAULT_EXPIRY) {
    this._weatherData = weatherData;
    this._locationData = location;
    this._expiryTime = expiry;
  }

  /**
   * Returns the current weather.
   */
  get weather() {
    return this._weatherData;
  }

  /**
   * Returns information about the location requested.
   */
  get location() {
    return this._locationData;
  }

  isExpired() {
    return Date.now() > this._expiryTime;
  }
}

/**
 *  Key {string}
 *    Location query. e.g., "nyc", "berlin".
 *  Value {CachedWeatherData}
 */
let cachedWeatherData = new Map();

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
class ProviderQuickSuggestWeather extends UrlbarProvider {
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
              classList: ["urlbarView-favicon"],
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
    return "ProviderQuickSuggestWeather";
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

    let cachedResult = cachedWeatherData.get(this._currentLocationString);
    if (!cachedResult || cachedResult.isExpired()) {
      // We need to refresh the cache.
      cachedWeatherData.delete(this._currentLocationString);

      // Do not fetch data if this query recently failed to return results.
      let timedOutDate = invalidLocations.get(this._currentLocationString);
      // Tests can override the default expiry.
      let expiryStorage = await browser.storage.local.get("testExpiry");
      let expiry = expiryStorage.testExpiry || DEFAULT_EXPIRY;
      if (timedOutDate && timedOutDate >= Date.now() - expiry) {
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
      if (!data || !data.weather) {
        invalidLocations.set(this._currentLocationString, Date.now());
        return false;
      }
      if (this.queryInstance != queryInstance) {
        return false;
      }
      cachedWeatherData.set(this._currentLocationString, data);
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
        textContent: `${result.payload.weatherData.temperature}${result.payload.units} `,
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
    let data = cachedWeatherData.get(this._currentLocationString);

    if (!data) {
      return;
    }

    const dayOfWeekFormatter = new Intl.DateTimeFormat("default", {
      weekday: "long",
      timeZone: data.location.TimeZone.Name,
    });

    let iconName = `icons/${ICON_MAP[data.weather.WeatherIcon] ||
      DEFAULT_ICON}`;
    let icon = browser.runtime.getURL(iconName);
    let result = new UrlbarResult(
      UrlbarUtils.RESULT_TYPE.DYNAMIC,
      UrlbarUtils.RESULT_SOURCE.OTHER_NETWORK,
      {
        title: queryContext.searchString,
        icon,
        iconDescription: data.weather.WeatherText,
        url: data.weather.Link,
        cityName: data.location.LocalizedName,
        // We show the state code for locations in the United States and the
        // country code for all other places.
        adminAreaCode:
          data.location.Country.ID == "US"
            ? data.location.AdministrativeArea.ID
            : data.location.AdministrativeArea.CountryID,
        // Convert UNIX time in seconds to milliseconds for the Date() object.
        forecastDay: dayOfWeekFormatter.format(data.weather.EpochTime * 1000),
        units: `°${
          this._isMetric(data.location)
            ? data.weather.Temperature.Metric.Unit
            : data.weather.Temperature.Imperial.Unit
        }`,
        weatherData: {
          temperature: Math.round(
            this._isMetric(data.location)
              ? data.weather.Temperature.Metric.Value
              : data.weather.Temperature.Imperial.Value
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
   * @returns {CachedWeatherData}
   *   Resolves to a CachedWeatherData containing weather data, location data,
   *   and an expiry time.
   */
  async getWeatherData(locationData) {
    const storage = await browser.storage.local.get(null);
    if (storage.testWeatherJson) {
      let expiry = Date.now() + (storage.testExpiry || DEFAULT_EXPIRY);
      return new CachedWeatherData(
        storage.testWeatherJson[0],
        locationData,
        expiry
      );
    }

    const locationKey = locationData?.Key;
    if (!locationKey) {
      return null;
    }

    const url = new URL("https://apidev.accuweather.com");
    url.pathname = `currentconditions/v1/${locationKey}.json`;
    // eslint-disable-next-line no-undef
    url.searchParams.append("apikey", ACCUWEATHER_SECRET_KEY);

    const response = await fetch(url);
    if (!response || !response.ok) {
      return null;
    }

    const expiryHeader = response.headers.get("Expiry");
    let expiry = expiryHeader ? new Date(expiryHeader) : null;

    const json = await response.json();
    if (!json.length) {
      // AccuWeather returns current weather as a single-element array.
      return null;
    }

    return new CachedWeatherData(json[0], locationData, expiry);
  }

  /**
   * @param {string} query
   *   A string describing a location. e.g. "Toronto"; "Paris France".
   * @returns {Promise}
   *   Resolves to an Object: {latitude, longitude, locality}
   */
  async getLocationDataFromQuery(query) {
    const storage = await browser.storage.local.get("testLocationJson");
    if (storage.testLocationJson) {
      return storage.testLocationJson[0];
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
    searchString = searchString.toLocaleLowerCase();
    let locationString = "";
    if (searchString.endsWith(" weather")) {
      locationString = searchString.slice(0, searchString.indexOf(" weather"));
    } else if (searchString.endsWith(" forecast")) {
      locationString = searchString.slice(0, searchString.indexOf(" forecast"));
    } else if (
      searchString.includes("weather in") ||
      searchString.includes("weather at")
    ) {
      locationString = searchString.slice(
        // 7: "weather".length
        // 3: " at"/" in".length
        searchString.indexOf("weather") + 7 + 3
      );
    } else if (searchString.startsWith("weather ")) {
      // 8: "weather ".length
      locationString = searchString.slice(8);
    }

    return locationString.trim();
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

let weatherProvider;
(async function main() {
  weatherProvider = new ProviderQuickSuggestWeather();
  addProvider(weatherProvider);
  sendTestMessage("ready");
})();

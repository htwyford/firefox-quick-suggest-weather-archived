/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_LOCATION_NEW = JSON.parse(
  `[{"Version":1,"Key":"9302_POI","Type":"POI","Rank":250,"LocalizedName":"Lakefront Airport","EnglishName":"Lakefront Airport","PrimaryPostalCode":"70126","Region":{"ID":"NAM","LocalizedName":"North America","EnglishName":"North America"},"Country":{"ID":"US","LocalizedName":"United States","EnglishName":"United States"},"AdministrativeArea":{"ID":"LA","LocalizedName":"Louisiana","EnglishName":"Louisiana","Level":1,"LocalizedType":"State","EnglishType":"State","CountryID":"US"},"TimeZone":{"Code":"CST","Name":"America/Chicago","GmtOffset":-6,"IsDaylightSaving":false,"NextOffsetChange":"2021-03-14T08:00:00Z"},"GeoPosition":{"Latitude":30.042,"Longitude":-90.028,"Elevation":{"Metric":{"Value":2,"Unit":"m","UnitType":5},"Imperial":{"Value":8,"Unit":"ft","UnitType":0}}},"IsAlias":false,"ParentCity":{"Key":"348585","LocalizedName":"New Orleans","EnglishName":"New Orleans"},"SupplementalAdminAreas":[],"DataSets":["AirQualityCurrentConditions","AirQualityForecasts","Alerts","DailyAirQualityForecast","DailyPollenForecast","ForecastConfidence","FutureRadar","MinuteCast","Radar"]}]`
);
const TEST_LOCATION_NEW_YORK = JSON.parse(
  `[{"Version":1,"Key":"349727","Type":"City","Rank":15,"LocalizedName":"New York","EnglishName":"New York","PrimaryPostalCode":"10007","Region":{"ID":"NAM","LocalizedName":"North America","EnglishName":"North America"},"Country":{"ID":"US","LocalizedName":"United States","EnglishName":"United States"},"AdministrativeArea":{"ID":"NY","LocalizedName":"New York","EnglishName":"New York","Level":1,"LocalizedType":"State","EnglishType":"State","CountryID":"US"},"TimeZone":{"Code":"EST","Name":"America/New_York","GmtOffset":-5,"IsDaylightSaving":false,"NextOffsetChange":"2021-03-14T07:00:00Z"},"GeoPosition":{"Latitude":40.779,"Longitude":-73.969,"Elevation":{"Metric":{"Value":8,"Unit":"m","UnitType":5},"Imperial":{"Value":26,"Unit":"ft","UnitType":0}}},"IsAlias":false,"SupplementalAdminAreas":[{"Level":2,"LocalizedName":"New York","EnglishName":"New York"}],"DataSets":["AirQualityCurrentConditions","AirQualityForecasts","Alerts","DailyAirQualityForecast","DailyPollenForecast","ForecastConfidence","FutureRadar","MinuteCast","Radar"]}]`
);
const TEST_WEATHER_JSON = JSON.parse(
  `[{"LocalObservationDateTime":"2020-11-16T14:28:00-05:00","EpochTime":1605554880,"WeatherText":"Cloudy","WeatherIcon":7,"HasPrecipitation":false,"PrecipitationType":null,"IsDayTime":true,"Temperature":{"Metric":{"Value":3.9,"Unit":"C","UnitType":17},"Imperial":{"Value":39,"Unit":"F","UnitType":18}},"MobileLink":"http://m.accuweather.com/en/ca/waterfront-communities/m5j/current-weather/3393497?lang=en-us","Link":"http://www.accuweather.com/en/ca/waterfront-communities/m5j/current-weather/3393497?lang=en-us"}]`
);

XPCOMUtils.defineLazyModuleGetters(this, {
  setTimeout: "resource://gre/modules/Timer.jsm",
});

/**
 * Tests sending various queries to the weather provider.
 */

add_task(async function init() {
  await initAddonTest(ADDON_PATH, EXPECTED_ADDON_SIGNED_STATE);
  UrlbarTestUtils.init(this);
  await SpecialPowers.pushPrefEnv({
    // Disable suggestions so we don't hit the network.
    set: [["browser.urlbar.suggest.searches", false]],
  });

  registerCleanupFunction(() => {
    UrlbarTestUtils.uninit();
  });
});

add_task(async function basic() {
  const testCases = [
    // [searchString, weatherExpected]
    ["weather in new", true],
    ["weather in new y", true],
    ["weather in new yo", true],
    ["weather in new yor", true],
    ["weather in new york", true],
    ["weather in", false],
    ["weather at new york", true],
    ["weather at", false],
    ["new york weather", true],
    ["weather", false],
    ["new york forecast", true],
    ["forecast", false],
    ["toronto forecast", true],
    // We wait until the place name is three characters long.
    ["weather in ny", false],
  ];
  await withAddon(async () => {
    const storageConn = await getExtensionStorage();
    let storage = {
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);

    for (let [searchString, weatherExpected] of testCases) {
      await runBasicTest(searchString, weatherExpected);
    }
  });
});

// Tests that we don't show a weather result if we get no/bad location data.
add_task(async function badLocationResponse() {
  await withAddon(async () => {
    // If we populate the extension's local storage with JSON objects at the
    // `testLocationJson` and `testWeatherJson` keys, the extension uses those
    // objects as its data source and does not hit the network.
    const storageConn = await getExtensionStorage();
    let storage = {
      testLocationJson: [],
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    let weatherRow = await promiseWeatherRow();
    Assert.ok(!weatherRow, "There is no weather result.");
    await UrlbarTestUtils.promisePopupClose(window);

    storage = {
      testLocationJson: { auth: "API key not authorized." },
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    weatherRow = await promiseWeatherRow();
    Assert.ok(!weatherRow, "There is no weather result.");
    await UrlbarTestUtils.promisePopupClose(window);
  });
});

// Tests that we don't show a weather result if we get no/bad weather data.
add_task(async function badWeatherResponse() {
  await withAddon(async () => {
    const storageConn = await getExtensionStorage();
    let storage = {
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: [],
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    let weatherRow = await promiseWeatherRow();
    Assert.ok(!weatherRow, "There is no weather result.");
    await UrlbarTestUtils.promisePopupClose(window);

    storage = {
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: { auth: "API key not authorized." },
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    weatherRow = await promiseWeatherRow();
    Assert.ok(!weatherRow, "There is no weather result.");
    await UrlbarTestUtils.promisePopupClose(window);
  });
});

// Tests that the weather result changes as the user refines their query.
add_task(async function refineQuery() {
  await withAddon(async () => {
    const storageConn = await getExtensionStorage();
    let storage = {
      // Note that this is intentionally "TEST_LOCATION_NEW". These data are the
      // actual results for an AccuWeather search for "new".
      testLocationJson: TEST_LOCATION_NEW,
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      // "new yor" is intentional. We are testing what happens when the next
      // search is "new york".
      value: "weather in new yor",
    });

    let weatherRow = await promiseWeatherRow();
    let locationNode = weatherRow.querySelector(
      ".urlbarView-dynamic-dynamicWeather-location"
    );
    Assert.equal(
      locationNode.textContent,
      "Lakefront Airport, LA",
      "We are not yet showing New York data."
    );

    storage = {
      // Note that this is now "NEW_YORK".
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });

    weatherRow = await promiseWeatherRow();
    locationNode = weatherRow.querySelector(
      ".urlbarView-dynamic-dynamicWeather-location"
    );
    Assert.equal(
      locationNode.textContent,
      "New York, NY",
      "We are showing New York data."
    );
  });
});

// Tests that we don't immediately re-query for data when a search for a
// location yields no results.
add_task(async function invalidLocations() {
  await withAddon(async () => {
    const storageConn = await getExtensionStorage();
    let storage = {
      // Note that we will fetch empty location data.
      testLocationJson: [],
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    let weatherRow = await promiseWeatherRow();
    Assert.ok(!weatherRow, "There is no weather row.");

    storage = {
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    weatherRow = await promiseWeatherRow();
    // We expect to not see a weather result because there was a recent request
    // for the same location that returned no results. We block subsequent
    // requests for that location for 10 minutes.
    Assert.ok(
      !weatherRow,
      "There is still no weather row despite getting good data."
    );
  });
});

// Tests that we re-query for data after a timeout when a previous search for a
// location yields no results.
add_task(async function invalidLocationsTimeout() {
  await withAddon(async () => {
    const storageConn = await getExtensionStorage();
    let storage = {
      // Note that we will fetch empty location data.
      testLocationJson: [],
      testWeatherJson: TEST_WEATHER_JSON,
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    let weatherRow = await promiseWeatherRow();
    Assert.ok(!weatherRow, "There is no weather row.");

    storage = {
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: TEST_WEATHER_JSON,
      // Set a very short timeout (1ms) so that the previous invalid location
      // will have timed out when we check it.
      testExpiry: 1,
    };
    storageConn.set(storage);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    weatherRow = await promiseWeatherRow();
    Assert.ok(
      weatherRow,
      "There is a weather row now that the invalid search has timed out."
    );
  });
});

// Tests that we use cached weather data for queries for the same location,
// until the cache expires.
add_task(async function weatherDataExpiry() {
  await withAddon(async () => {
    const storageConn = await getExtensionStorage();
    let storage = {
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: TEST_WEATHER_JSON,
      // Set the expiry timeout to one second. We'll later wait in a setTimeout
      // for it to expire.
      testExpiry: 1000,
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    let expiryTimeout = new Promise(resolve => setTimeout(resolve, 1000));
    let weatherRow = await promiseWeatherRow();
    let temperatureNode = weatherRow.querySelector(
      ".urlbarView-dynamic-dynamicWeather-currentTemperature"
    );
    Assert.equal(
      temperatureNode.textContent.trim(),
      "39°F",
      "Sanity check: the weather result is showing the initial temperature of 39 degrees."
    );
    await UrlbarTestUtils.promisePopupClose(window);

    // Now change the weather data to read 93 degrees. We expect to observe the
    // weather result is not updated until the data expires.
    let differentWeather = TEST_WEATHER_JSON;
    differentWeather[0].Temperature.Imperial.Value = 93;

    storage = {
      testLocationJson: TEST_LOCATION_NEW_YORK,
      testWeatherJson: differentWeather,
    };
    storageConn.set(storage);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    weatherRow = await promiseWeatherRow();
    temperatureNode = weatherRow.querySelector(
      ".urlbarView-dynamic-dynamicWeather-currentTemperature"
    );
    Assert.equal(
      temperatureNode.textContent.trim(),
      "39°F",
      "The weather result still reads 39 degrees despite the weather data changing."
    );
    await UrlbarTestUtils.promisePopupClose(window);

    // Wait for the initial data to expire.
    await expiryTimeout;
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "weather in new york",
    });
    weatherRow = await promiseWeatherRow();
    temperatureNode = weatherRow.querySelector(
      ".urlbarView-dynamic-dynamicWeather-currentTemperature"
    );
    Assert.equal(
      temperatureNode.textContent.trim(),
      "93°F",
      "The weather result reads 93 degrees now that the original data have expired."
    );
  });
});

async function runBasicTest(searchString, weatherExpected) {
  info(
    `Searching for "${searchString}". Weather result is ${
      weatherExpected ? "expected" : "not expected"
    }.`
  );
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: searchString,
  });

  if (weatherExpected) {
    let weatherRow = await promiseWeatherRow();
    let icon = weatherRow.getElementsByClassName(
      "urlbarView-dynamic-dynamicWeather-icon"
    )[0].src;
    // The test weather data is for a cloudy day.
    Assert.ok(
      icon.endsWith("cloudy.svg"),
      `The result is showing the correct icon. Path to icon: ${icon}`
    );
  } else {
    let resultCount = UrlbarTestUtils.getResultCount(window);
    let row = await UrlbarTestUtils.waitForAutocompleteResultAt(
      window,
      resultCount - 1
    );
    Assert.ok(!row.result.payload.dynamicType, "There is no weather result.");
  }
}

/**
 * Waits up to `browser.urlbar.extension.timeout` ms for a weather result to
 * appear. Populating the in the dynamic result can take some time. In
 * real-world conditions, the extension has up to
 * `browser.urlbar.extension.timeout` milliseconds to return a result.
 *
 * @returns {Node} The DOM node for the weather result, or null if there is no
 *   weather result.
 */
async function promiseWeatherRow(win = window) {
  let resultCount = UrlbarTestUtils.getResultCount(win);
  let weatherRow = await UrlbarTestUtils.waitForAutocompleteResultAt(
    win,
    resultCount - 1
  );

  if (weatherRow.result.payload.dynamicType != "dynamicWeather") {
    // Bail early if the last result is not a weather result.
    return null;
  }

  const timeoutLength = UrlbarPrefs.get("extension.timeout");
  await TestUtils.waitForCondition(
    () => {
      // We choose the icon being populated as a benchmark for the rest of
      // the result being populated.
      return weatherRow.getElementsByClassName(
        "urlbarView-dynamic-dynamicWeather-icon"
      )[0].src;
    },
    "Waiting for weather result to be populated.",
    50,
    Math.floor(timeoutLength / 50)
  );
  Assert.equal(
    weatherRow.result.payload.dynamicType,
    "dynamicWeather",
    "The weather row is in the DOM."
  );
  return weatherRow;
}

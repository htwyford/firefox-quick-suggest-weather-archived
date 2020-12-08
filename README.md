# firefox-quick-suggest-weather

Watch a [short demo video](https://imgur.com/a/mykAcB6).

## Instructions
1. Clone this repo and install the dependencies.
2. Give the extension access to location and weather data. You may either use live data by creating `src/secret_keys.js` and populating it with:
    ```
    const ACCUWEATHER_SECRET_KEY = "<AccuWeather API key>";
    ```

    Or you may use test data by adding this block to the `ProviderQuickSuggestWeather` constructor:
    ```
    let storage = {
      testLocationJson: JSON.parse(
        `[{"Version":1,"Key":"349727","Type":"City","Rank":15,"LocalizedName":"New York","EnglishName":"New York","PrimaryPostalCode":"10007","Region":{"ID":"NAM","LocalizedName":"North America","EnglishName":"North America"},"Country":{"ID":"US","LocalizedName":"United States","EnglishName":"United States"},"AdministrativeArea":{"ID":"NY","LocalizedName":"New York","EnglishName":"New York","Level":1,"LocalizedType":"State","EnglishType":"State","CountryID":"US"},"TimeZone":{"Code":"EST","Name":"America/New_York","GmtOffset":-5,"IsDaylightSaving":false,"NextOffsetChange":"2021-03-14T07:00:00Z"},"GeoPosition":{"Latitude":40.779,"Longitude":-73.969,"Elevation":{"Metric":{"Value":8,"Unit":"m","UnitType":5},"Imperial":{"Value":26,"Unit":"ft","UnitType":0}}},"IsAlias":false,"SupplementalAdminAreas":[{"Level":2,"LocalizedName":"New York","EnglishName":"New York"}],"DataSets":["AirQualityCurrentConditions","AirQualityForecasts","Alerts","DailyAirQualityForecast","DailyPollenForecast","ForecastConfidence","FutureRadar","MinuteCast","Radar"]}]`
      ),
      testWeatherJson: JSON.parse(
        `[{"LocalObservationDateTime":"2020-11-16T14:28:00-05:00","EpochTime":1605554880,"WeatherText":"Cloudy","WeatherIcon":7,"HasPrecipitation":false,"PrecipitationType":null,"IsDayTime":true,"Temperature":{"Metric":{"Value":3.9,"Unit":"C","UnitType":17},"Imperial":{"Value":39,"Unit":"F","UnitType":18}},"MobileLink":"http://m.accuweather.com/en/ca/waterfront-communities/m5j/current-weather/3393497?lang=en-us","Link":"http://www.accuweather.com/en/ca/waterfront-communities/m5j/current-weather/3393497?lang=en-us"}]`
      ),
    };
    browser.local.storage.set(storage);
    ```
3. `web-ext build`
4. In Firefox, set the pref `extensions.experiments.enabled` to `true`. Then open about:debugging.
5. Install the .zip file created by `web-ext build` as a temporary add-on.
6. Search for "weather" or "weather in `<LOCATION_NAME>`" in the Urlbar.

## Testing

The tests directory contains browser chrome mochitests and a head.js. The
head.js implements a simple framework for testing Normandy experiment add-on
files.

The requirements above for running the add-on apply to testing it, too. You'll
need either a Mozilla-signed version of the add-on; or Firefox Nightly,
Developer Edition, or any other Firefox build that gives privileges to
temporarily installed add-ons.

To run the test in a particular version of Firefox, you'll need to clone the
repo from which your Firefox was built. If you're testing in Nightly, you'll
need [mozilla-central]. If you're testing in Developer Edition or Beta, you'll
need [mozilla-beta].

Then:

1. `cd` into your firefox-quick-suggest-weather clone.
2. Copy tests/* into srcdir/testing/extensions, where *srcdir* is the top-level
   directory of your Firefox repo:

       $ cp -R tests/* srcdir/testing/extensions

3. Build the add-on zip file using web-ext as described above:

       $ web-ext build

   Or use a signed copy of the zip file.

4. Copy the zip file into srcdir/testing/extensions/tests/browser:

       $ cp web-ext-artifacts/firefox_quick_suggest_weather-1.2a.zip srcdir/testing/extensions/tests/browser

5. Update `EXPECTED_ADDON_SIGNED_STATE` as necessary in
   srcdir/testing/extensions/tests/browser/head.js.  If your zip file is
   unsigned, its value should be `AddonManager.SIGNEDSTATE_MISSING`. If it's
   signed, it should be `AddonManager.SIGNEDSTATE_PRIVILEGED`.

6. `cd` into your srcdir.
7. Run the tests using mach:

       $ ./mach mochitest -f browser --appname <path to Firefox binary> testing/extensions/tests/browser

   If your Firefox repo itself contains the Firefox binary (because you ran
   `mach build`), you can omit the `--appname` argument.

   If mach doesn't find the test, remove your objdir, `mach build`, and try
   again from step 1.

[mozilla-central]: http://hg.mozilla.org/mozilla-central/
[mozilla-beta]: https://hg.mozilla.org/releases/mozilla-beta/

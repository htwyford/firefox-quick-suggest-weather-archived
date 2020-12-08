# dynamic-weather-result-extension

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

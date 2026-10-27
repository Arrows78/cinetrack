# Changelog

## [0.4.1](https://github.com/Arrows78/cinetrack/compare/v0.4.0...v0.4.1) (2026-10-27)


### Bug fixes

* **desktop:** place the browser-preview hint in a labelled landmark ([11b4789](https://github.com/Arrows78/cinetrack/commit/11b4789a246b59c1c332ecdff2bb27a3004af159))
* **errors:** report every failed local command as a local data problem, not as a TMDB outage ([18ddcae](https://github.com/Arrows78/cinetrack/commit/18ddcaee29aeb12061672a3a7763cfdeebf075bd))
* **errors:** say a title is missing when TMDB answers 404, instead of blaming the network ([bff9fdf](https://github.com/Arrows78/cinetrack/commit/bff9fdf1e073871a484d3906103f87b1baa5aca1))
* **history:** keep the page within a 360px window, the date filters were pushing it wider ([8c02657](https://github.com/Arrows78/cinetrack/commit/8c0265774639669ef7c674367c514aa0f4fa763e))
* **home:** give the hero's previous and next arrows an accessible name ([57c0773](https://github.com/Arrows78/cinetrack/commit/57c0773bb1798d60ef60d1a2a5c7519010535c63))
* **library:** make the lists and smart lists accordion headings h2, right under the page's h1 ([d20cca2](https://github.com/Arrows78/cinetrack/commit/d20cca25491ba9c0d0e324fa4c8bab6e6dc5e521))
* **media:** keep the catalogue loading with the default language and region when stored preferences cannot be read ([2287509](https://github.com/Arrows78/cinetrack/commit/22875096c34cbdaa28f83c04d3856c5b34bab2ba))
* **pages:** keep a page-level heading when an error state replaces the stats or a detail page ([3dc0e9e](https://github.com/Arrows78/cinetrack/commit/3dc0e9e15f4469622ba8be134994dcc434dc37f1))
* **pages:** make the not-found state of a detail page its h1 ([144b60d](https://github.com/Arrows78/cinetrack/commit/144b60dcd35827697c48029493723c1d6006f116))
* **settings:** keep the data, desktop and about sections reachable when preferences fail to load ([6ceab4e](https://github.com/Arrows78/cinetrack/commit/6ceab4ebf27020405cd77e30e973ff1500745b2d))
* **settings:** wrap the TMDB vault buttons so the French labels fit a 360px window ([ac15945](https://github.com/Arrows78/cinetrack/commit/ac15945a692321a7d9fff0195165ca08ab8bbf81))
* **ui:** let a section header's action wrap under its title instead of squeezing it into a scroll strip ([bececae](https://github.com/Arrows78/cinetrack/commit/bececae1e5d32aa2ebd660f81bad7412270f6910))
* **ui:** wrap long words in detail titles, biographies and reviews instead of overflowing on narrow windows ([9e459d8](https://github.com/Arrows78/cinetrack/commit/9e459d833df6c378699fb462090ed5d1349c07b7))

## [0.4.0](https://github.com/Arrows78/cinetrack/compare/v0.3.0...v0.4.0) (2026-10-24)


### Features

* **desktop:** configure the in-app update channel and publish latest.json with each release ([a252c10](https://github.com/Arrows78/cinetrack/commit/a252c10c67d85924ec161e984178cf076625fda4))


### Bug fixes

* **ci:** take the newly published rustls-webpki, webpki-roots, ctutils and zod fixes and give each scanner the ignores it actually reads ([17bfd06](https://github.com/Arrows78/cinetrack/commit/17bfd0663c6ca00725cf378847882790f6b5dac4))
* **release:** sync the Tauri and Cargo versions with a script instead of release-please's file updaters ([ea832e3](https://github.com/Arrows78/cinetrack/commit/ea832e3346026adcf180767f73ed08319534bdfc))

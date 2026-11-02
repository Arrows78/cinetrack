# Changelog

## [0.5.0](https://github.com/Arrows78/cinetrack/compare/v0.4.1...v0.5.0) (2026-11-01)


### Features

* **backup:** rebase restore preview onto main ([9be6dcd](https://github.com/Arrows78/cinetrack/commit/9be6dcd9ded2c60582b753350362ec3c2bdc5293))
* **desktop:** configure the in-app update channel and publish latest.json with each release ([a252c10](https://github.com/Arrows78/cinetrack/commit/a252c10c67d85924ec161e984178cf076625fda4))
* **diagnostics:** export privacy-redacted support report ([774f640](https://github.com/Arrows78/cinetrack/commit/774f6406ee18ffff838d946a79fe5ad6f8c212dc))
* **diagnostics:** export support report helpers ([a03e249](https://github.com/Arrows78/cinetrack/commit/a03e249682b32d026a8aac6ab23afc20bd1264a5))
* **diagnostics:** expose support report export ([50d9dde](https://github.com/Arrows78/cinetrack/commit/50d9ddef6124932b99decc8bfa172622258936cb))
* **diagnostics:** translate support report export ([fbffc69](https://github.com/Arrows78/cinetrack/commit/fbffc6914a4398a163741bece53cdbb95d331da0))
* **diagnostics:** translate support report export ([f67df47](https://github.com/Arrows78/cinetrack/commit/f67df47191053d2873de617251f41a46f2b5869d))
* **diagnostics:** treat share-sheet dismissal as cancellation ([c196982](https://github.com/Arrows78/cinetrack/commit/c196982a82ef932bbdffa685d80dd050c7709521))
* **home:** prioritize freshest watch-next entries ([b29be8e](https://github.com/Arrows78/cinetrack/commit/b29be8e5e4eb6d8520d2151206aa20192d240e33))
* **home:** put fresh episode drops first ([928954d](https://github.com/Arrows78/cinetrack/commit/928954db15e724bde6992257e59a726a8523a314))
* **mobile:** explain sandboxed backup behavior ([490c101](https://github.com/Arrows78/cinetrack/commit/490c1016670cf71cebd2ed849bb26dcc5f3729a5))
* **mobile:** explain sandboxed backup behavior ([479167f](https://github.com/Arrows78/cinetrack/commit/479167f66839c6f038baaf95e364784b653d0380))
* **palette:** log a dated watch, and mark or open the next episode ([9fede86](https://github.com/Arrows78/cinetrack/commit/9fede86287fbe15cf3878014c5efe02ea5e01305))
* **progress:** show the total catch-up backlog on the home page and in Stats ([aff54c4](https://github.com/Arrows78/cinetrack/commit/aff54c4475a00caf62769f8c19b1db1d516d7cb5))
* **series:** show how long is left to catch up on a series ([0f418bb](https://github.com/Arrows78/cinetrack/commit/0f418bb1ecbfe268f1a12847c4086aed49417ffe))
* **stats:** show the directors and actors you watch most ([17f3027](https://github.com/Arrows78/cinetrack/commit/17f3027936fdc1e09e039420b0637ef3a453d015))
* **sync:** add device-local run history key ([950fdb0](https://github.com/Arrows78/cinetrack/commit/950fdb0b10cbb4bd291382b7168c56f628330542))
* **sync:** expose recent run history hook ([dcc7732](https://github.com/Arrows78/cinetrack/commit/dcc7732bf983f88ae23e690de7919646f1e9f10e))
* **sync:** record successful and failed sync runs ([6a7786f](https://github.com/Arrows78/cinetrack/commit/6a7786fabbf1baf374ea5a3fd9c30c35ea645c51))
* **sync:** show recent sync runs in settings ([5ff2629](https://github.com/Arrows78/cinetrack/commit/5ff26291ac9f8ecc4189232698e1052d70660661))
* **sync:** store recent sync run outcomes locally ([8cf3aa7](https://github.com/Arrows78/cinetrack/commit/8cf3aa74c93dd9a3c4e028601e309f7eb5d25934))
* **sync:** translate recent run history ([e75efdd](https://github.com/Arrows78/cinetrack/commit/e75efddb9a0d4b841000a8f7728701012584a07c))
* **sync:** translate recent run history ([7b37c29](https://github.com/Arrows78/cinetrack/commit/7b37c29d78e0dded667a8e03755f8d4974d60840))
* **ui:** add a System theme that follows the OS appearance live ([3aae612](https://github.com/Arrows78/cinetrack/commit/3aae6129694bea0e793045a9671205e5a274ce74))


### Bug fixes

* **account:** clean up abandoned email-change addresses ([9e7a1da](https://github.com/Arrows78/cinetrack/commit/9e7a1dad30952f14c0afc8485a14ee10d18c3aed))
* **auth:** keep OAuth nonce out of diagnostic logs ([062874f](https://github.com/Arrows78/cinetrack/commit/062874f8ccb4278f8a9918d53c6b9680a98d5091))
* **auth:** surface clipboard failures ([82fb087](https://github.com/Arrows78/cinetrack/commit/82fb0872c5f0c4bb7bac625fbf7dc5fc751d0b50))
* **auth:** translate clipboard failure feedback ([bfcb6ec](https://github.com/Arrows78/cinetrack/commit/bfcb6ec0679eb41c5bc2d115a476d06970448c43))
* **auth:** translate clipboard failure feedback ([cc73899](https://github.com/Arrows78/cinetrack/commit/cc738998696e80527b7f4d685845f04057441d7f))
* **ci:** restore the frontend gate ([d647a31](https://github.com/Arrows78/cinetrack/commit/d647a31c528a26b1c233a091c14320c307527391))
* **ci:** take the newly published rustls-webpki, webpki-roots, ctutils and zod fixes and give each scanner the ignores it actually reads ([17bfd06](https://github.com/Arrows78/cinetrack/commit/17bfd0663c6ca00725cf378847882790f6b5dac4))
* **collection:** report partial batch-add results ([2872bf1](https://github.com/Arrows78/cinetrack/commit/2872bf1cbb87825a58920d96bdf35898cbd04e03))
* **collection:** translate partial batch results ([ba1caef](https://github.com/Arrows78/cinetrack/commit/ba1caefab6741cac07f33252a3996d3ef1b900de))
* **collection:** translate partial batch results ([3e9f636](https://github.com/Arrows78/cinetrack/commit/3e9f636d2b97c2e74a1a77202baeba6b7992eb3f))
* **desktop:** place the browser-preview hint in a labelled landmark ([11b4789](https://github.com/Arrows78/cinetrack/commit/11b4789a246b59c1c332ecdff2bb27a3004af159))
* **errors:** report every failed local command as a local data problem, not as a TMDB outage ([18ddcae](https://github.com/Arrows78/cinetrack/commit/18ddcaee29aeb12061672a3a7763cfdeebf075bd))
* **errors:** say a title is missing when TMDB answers 404, instead of blaming the network ([bff9fdf](https://github.com/Arrows78/cinetrack/commit/bff9fdf1e073871a484d3906103f87b1baa5aca1))
* **history:** keep the page within a 360px window, the date filters were pushing it wider ([8c02657](https://github.com/Arrows78/cinetrack/commit/8c0265774639669ef7c674367c514aa0f4fa763e))
* **home:** give the hero's previous and next arrows an accessible name ([57c0773](https://github.com/Arrows78/cinetrack/commit/57c0773bb1798d60ef60d1a2a5c7519010535c63))
* **library:** make the lists and smart lists accordion headings h2, right under the page's h1 ([d20cca2](https://github.com/Arrows78/cinetrack/commit/d20cca25491ba9c0d0e324fa4c8bab6e6dc5e521))
* **media:** keep the catalogue loading with the default language and region when stored preferences cannot be read ([2287509](https://github.com/Arrows78/cinetrack/commit/22875096c34cbdaa28f83c04d3856c5b34bab2ba))
* **media:** preload images through the real image cache ([e436339](https://github.com/Arrows78/cinetrack/commit/e436339e99747c0505510e80900f1956fd80c96c))
* **mobile:** keep automatic backups in the app sandbox ([050feaf](https://github.com/Arrows78/cinetrack/commit/050feafb0b59c0037a01474aa735a27f409a8e44))
* **mobile:** keep offline status above bottom navigation ([a87579a](https://github.com/Arrows78/cinetrack/commit/a87579a6fb5c52c2efc99c0a3b0e620d31678770))
* **mobile:** keep toasts above bottom navigation ([7521429](https://github.com/Arrows78/cinetrack/commit/7521429a832590e9b71bd7cb073f666bd05465b3))
* **mobile:** preserve whitespace in safe-area calc expressions ([45981c5](https://github.com/Arrows78/cinetrack/commit/45981c5000e5454543b0dda2752e66e28d9d41aa))
* **mobile:** preserve whitespace in safe-area calc expressions ([2ee577a](https://github.com/Arrows78/cinetrack/commit/2ee577aca2a06f3e92f3074a379c719360ff95d8))
* **mobile:** preserve whitespace in safe-area calc expressions ([6107bfe](https://github.com/Arrows78/cinetrack/commit/6107bfeb70da4540b4751e55e12338e79172cfad))
* **mobile:** preserve whitespace in safe-area calc expressions ([a9262d5](https://github.com/Arrows78/cinetrack/commit/a9262d5f65fd24042a1f95e1ac6c841c4d43b1c7))
* **mobile:** preserve whitespace in safe-area calc expressions ([4c96bd8](https://github.com/Arrows78/cinetrack/commit/4c96bd806c4208aac49880c8190c8487526c80e8))
* **mobile:** preserve whitespace in safe-area calc expressions ([8e2f621](https://github.com/Arrows78/cinetrack/commit/8e2f6210457901df18f2525176de5e2b3ee24483))
* **mobile:** reschedule maintenance on foreground resume ([db10293](https://github.com/Arrows78/cinetrack/commit/db1029318b5e2aef751ddc997fc2bd7b3066507f))
* **mobile:** respect safe area in browser preview banner ([f431085](https://github.com/Arrows78/cinetrack/commit/f431085233afde5cd7e21e761d6c71d0250241c5))
* **mobile:** share portable backups through the native sheet ([9b5277d](https://github.com/Arrows78/cinetrack/commit/9b5277daeec92735d4578464ad2b60f9710adfb0))
* **mobile:** skip desktop-only shortcut and tray wiring ([4c38ca6](https://github.com/Arrows78/cinetrack/commit/4c38ca6f7ef3a506035e4547f8c39402f08b2222))
* **mobile:** use cross-platform notification label ([5affbf5](https://github.com/Arrows78/cinetrack/commit/5affbf5188e0f7f59aa53f8fb5617b748f53d349))
* **mobile:** use cross-platform notification label ([e06d89d](https://github.com/Arrows78/cinetrack/commit/e06d89d70e5e63fa3f3d3cb30a58e24e89fe7d1e))
* **mobile:** use dynamic viewport height for full-screen states ([6795b94](https://github.com/Arrows78/cinetrack/commit/6795b945af5e4680d37e433567bbda1537c291c6))
* **mobile:** use dynamic viewport height for full-screen states ([4eb23d4](https://github.com/Arrows78/cinetrack/commit/4eb23d41d3d2cca975e985c30098a6cbe34f3078))
* **mobile:** use dynamic viewport height for full-screen states ([be2fbcb](https://github.com/Arrows78/cinetrack/commit/be2fbcb165037c1b2ec7df276ad863bf6610fc91))
* **mobile:** use dynamic viewport height for full-screen states ([d7905cf](https://github.com/Arrows78/cinetrack/commit/d7905cf6344d3316ece422535ff1ca26006f1f1c))
* **mobile:** use dynamic viewport height for full-screen states ([1e38df1](https://github.com/Arrows78/cinetrack/commit/1e38df174b60d457d13bc2bd1fee07ee6f82c7d3))
* **mobile:** use dynamic viewport height for full-screen states ([cee0835](https://github.com/Arrows78/cinetrack/commit/cee083522147942c3af4eca478ae3b935377c65c))
* **mobile:** wake periodic checks when app resumes ([4bb258b](https://github.com/Arrows78/cinetrack/commit/4bb258b71718cbe5bde8656b35144d484e39aec3))
* **pages:** keep a page-level heading when an error state replaces the stats or a detail page ([3dc0e9e](https://github.com/Arrows78/cinetrack/commit/3dc0e9e15f4469622ba8be134994dcc434dc37f1))
* **pages:** make the not-found state of a detail page its h1 ([144b60d](https://github.com/Arrows78/cinetrack/commit/144b60dcd35827697c48029493723c1d6006f116))
* **progress:** count series progress against aired episodes, not the announced total ([d0360a7](https://github.com/Arrows78/cinetrack/commit/d0360a7e087e62b0068ca35c4cabdae1e008b9cf))
* **progress:** stop a read that predates a write from coming back as fresh ([56938f1](https://github.com/Arrows78/cinetrack/commit/56938f14550cdd62b02c4caa3d9bed1f40421b3a))
* **release:** export only the signing secrets that exist, an empty certificate variable made the macOS build fail ([2534884](https://github.com/Arrows78/cinetrack/commit/2534884bc09135fe0e2f9e5e4cd1a19af4e9f4d1))
* **release:** keep the gate, checksums and publish jobs from being skipped when release-please is ([5cb2b11](https://github.com/Arrows78/cinetrack/commit/5cb2b117dc5d8496fc331f14320d46065725ea0b))
* **release:** sync the Tauri and Cargo versions with a script instead of release-please's file updaters ([ea832e3](https://github.com/Arrows78/cinetrack/commit/ea832e3346026adcf180767f73ed08319534bdfc))
* **release:** wait for the CI and visual-regression runs of the released commit, not for a check run that appears only at the end of the CI ([23d72ba](https://github.com/Arrows78/cinetrack/commit/23d72baf5eb588755784cd03b296d1cdfc10e99b))
* **security:** remediate dependency and token-handling findings ([#96](https://github.com/Arrows78/cinetrack/issues/96)) ([c125727](https://github.com/Arrows78/cinetrack/commit/c125727fb1afd22cd5959ecaf1d47d41e521c2e3))
* **settings:** keep the data, desktop and about sections reachable when preferences fail to load ([6ceab4e](https://github.com/Arrows78/cinetrack/commit/6ceab4ebf27020405cd77e30e973ff1500745b2d))
* **settings:** remove ineffective image-cache controls ([3711a2d](https://github.com/Arrows78/cinetrack/commit/3711a2d5e70ce96aab463b209ef6e6105e48de53))
* **settings:** surface clipboard failures for diagnostics ([a49e170](https://github.com/Arrows78/cinetrack/commit/a49e170cf2e47060561505c6b93cdbe1473b0489))
* **settings:** wrap the TMDB vault buttons so the French labels fit a 360px window ([ac15945](https://github.com/Arrows78/cinetrack/commit/ac15945a692321a7d9fff0195165ca08ab8bbf81))
* **ui:** let a section header's action wrap under its title instead of squeezing it into a scroll strip ([bececae](https://github.com/Arrows78/cinetrack/commit/bececae1e5d32aa2ebd660f81bad7412270f6910))
* **ui:** wrap long words in detail titles, biographies and reviews instead of overflowing on narrow windows ([9e459d8](https://github.com/Arrows78/cinetrack/commit/9e459d833df6c378699fb462090ed5d1349c07b7))

## [0.4.1](https://github.com/Arrows78/cinetrack/compare/v0.4.0...v0.4.1) (2026-11-01)


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

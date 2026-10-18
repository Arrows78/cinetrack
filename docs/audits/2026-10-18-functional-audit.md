# Audit fonctionnel de CineTrack

Audit du 18 octobre 2026, sur la version 0.3.0, à partir du commit `5406c64`.

Les défauts corrigés concernent principalement la recherche, les informations de
disponibilité, le suivi des épisodes et les rappels. Le socle SQLite dispose déjà
de tests couvrant les transitions de statut, les imports, la persistance et la
synchronisation simulée. La priorité suivante est de vérifier ces parcours dans
la fenêtre Tauri et sur deux appareils connectés au même compte.

## Corrections réalisées

P1 désigne un parcours principal incorrect ou une écriture proposée sur un état
inconnu. P2 désigne une information erronée, une notification manquée ou une
récupération après erreur incomplète.

| Priorité | Scénario reproductible avant correction                                                                                                                                                        | Comportement corrigé                                                                                                                                                                                                                  | Preuve automatisée                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P1       | Saisir « Batman » avec un genre, une plateforme ou un studio actif : le texte est ignoré au profit de la découverte.                                                                           | Le titre et les filtres se cumulent. Le texte et les critères participent à la clé de cache. La recherche conserve l’ordre de pertinence et sa pagination.                                                                            | `features/media/__tests__/use-search.test.tsx` et `pages/__tests__/search-page.test.tsx` |
| P1       | Une lecture de progression est encore en attente ou échoue : des actions individuelles et l’ajout d’une note restent disponibles, en supposant que rien n’a été vu.                            | Les actions de visionnage des fiches film, série, saison et épisode attendent un état exploitable. Une erreur propose de réessayer. Le prochain épisode n’est proposé qu’après chargement de la progression et de toutes les saisons. | Tests des quatre pages de détail dans `src/pages/__tests__`                              |
| P1       | TMDB annonce quatre épisodes, mais trois seulement sont diffusés : la fiche série remplace le total stocké par trois. Une série terminée côté TMDB peut alors être déclarée terminée trop tôt. | La fiche et l’accueil utilisent le même total annoncé. Le total des épisodes diffusés sert uniquement à afficher la progression. Une valeur inconnue ne remplace pas le total stocké.                                                 | `pages/__tests__/series-detail-page.test.tsx`                                            |
| P2       | Deux instantanés FR et US existent pour le même titre : l’accueil ou une liste intelligente peut utiliser le mauvais pays.                                                                     | Une alerte utilise son pays ; une liste intelligente utilise le pays sélectionné dans les préférences. L’ordre des instantanés ne modifie plus le résultat.                                                                           | Tests `use-availability-alerts` et `use-smart-list-matches`                              |
| P2       | Demander un film français dans « Ce soir » : le filtre compare `FR` à `France` et écarte le film prévu.                                                                                        | Les codes pays servent au filtrage ; les noms restent disponibles pour l’affichage.                                                                                                                                                   | `watch-tonight-service.test.ts`, avec le véritable mapper TMDB                           |
| P2       | Une première page de sorties contient un film hors de la période : les pages suivantes ne sont plus lues.                                                                                      | Le calendrier continue jusqu’à la dernière page ou sa limite de sécurité. Une date hors période ne signifie pas que les autres pages sont hors période.                                                                               | `calendar-service.test.ts`                                                               |
| P2       | Les fiches de séries se chargent mais leurs saisons échouent : le calendrier affiche une liste vide.                                                                                           | Une absence de données accompagnée d’un échec de source produit une erreur réessayable. Les entrées obtenues des autres sources restent affichées.                                                                                    | `calendar-service.test.ts`                                                               |
| P2       | Une liste intelligente dépend d’épisodes indisponibles : « Réessayer » ne relance pas leur résolution. Un échec des préférences est également ignoré.                                          | La relance atteint les épisodes et les préférences ; leur échec est signalé.                                                                                                                                                          | `use-smart-list-matches.test.tsx` et `use-watch-next-all-seasons.test.tsx`               |
| P2       | Changer la langue laisse les prochains épisodes dans l’ancienne langue pendant la durée du cache.                                                                                              | La modification invalide aussi les résolutions des prochains épisodes.                                                                                                                                                                | `use-preferences.test.tsx`                                                               |
| P2       | Le profil A reçoit un rappel de sortie, puis le profil B suit le même titre : le rappel de B est considéré comme déjà envoyé.                                                                  | La déduplication des rappels de calendrier est propre à chaque profil.                                                                                                                                                                | `notification-service.test.ts`                                                           |
| P2       | Une vérification automatique enregistre une nouvelle disponibilité sans rafraîchir les cartes déjà affichées.                                                                                  | Les instantanés de disponibilité et le suivi du profil sont invalidés après une vérification réussie.                                                                                                                                 | `app/__tests__/periodic-checks.test.ts`                                                  |

La correction de pagination s’appuie sur le contrat TMDB : le flux « Upcoming »
est équivalent à une découverte triée par popularité, pas par date.
[Documentation officielle TMDB](https://developer.themoviedb.org/reference/movie-upcoming-list).

## Améliorations fonctionnelles livrées

La combinaison du titre et des filtres a été choisie explicitement pendant
l’audit. Les recherches avec plateforme vérifient l’offre incluse dans un
abonnement ; la seule présence d’une location ne suffit pas. Les studios
restreignent les films. Les vérifications complémentaires réutilisent les caches
existants et sont limitées à quatre traitements simultanés.

Si une page filtrée est vide mais que d’autres résultats existent, l’interface
l’indique et permet de charger la suite. Elle n’annonce plus que toute la
recherche est vide. Un échec de vérification de plateforme produit une erreur,
plutôt qu’un faux résultat négatif.

Les paramètres permettent désormais de choisir le délai d’un rappel : le jour
de la sortie, ou 6, 12, 24, 48, 72 ou 168 heures avant. Une valeur personnalisée
déjà enregistrée reste sélectionnable. Ce réglage conserve les interrupteurs de
notifications existants et ne demande pas de permission système à lui seul.
Les rappels restent vérifiés au lancement et lors des contrôles automatiques ;
ce réglage ne crée pas une tâche système capable de fonctionner application fermée.

## Couverture des parcours

| Domaine                                     | Vérification effectuée                                                                                                                  | Limite pratique                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Démarrage, profils, PIN et préférences      | Tests des barrières d’accès, création et changement de profil, isolation et persistance ; lecture des appels de changement de profil.   | Connexion Clerk réelle et comportement du trousseau système non exercés.                              |
| Accueil et découverte                       | Lecture de la composition des flux, tests des recommandations et des états partiels, correction des régions et du pays des suggestions. | Les réponses TMDB sont simulées dans les tests.                                                       |
| Recherche                                   | Tests du texte, des filtres combinés, des changements de requête, des erreurs de plateforme et de la pagination.                        | La recherche de personnes conserve sa pagination actuelle, limitée à la première page.                |
| Bibliothèque et listes                      | Tests des filtres, tris, listes manuelles et intelligentes, statuts et invalidations ; lecture du stockage Rust des listes.             | Les vues Films et Séries chargent encore leur bibliothèque par type en une fois.                      |
| Films, séries, saisons et épisodes          | Tests des actions, des chargements partiels, des états vus, des notes, des totaux et des prochains épisodes.                            | Pas de session de visionnage réalisée dans une fenêtre Tauri réelle.                                  |
| Historique, statistiques et revisionnages   | Suites TypeScript et Rust existantes : ordre des événements, état courant, fuseaux horaires et cohérence des agrégats.                  | Les exports visuels annuels ne constituent pas une validation des polices sur toutes les plateformes. |
| Calendrier et alertes                       | Tests des dates, de la pagination, des pannes, du rafraîchissement et de la déduplication par profil.                                   | Réception réelle des notifications système non exercée.                                               |
| Import TV Time, sauvegardes et restauration | Suites Rust et TypeScript existantes : validation, transactions, aller-retour, annulation et conservation des données.                  | Les contraintes d’un dossier cloud externe ne sont pas reproduites.                                   |
| Synchronisation                             | Tests existants de conflits, files d’attente, profils et convergence à deux ou trois appareils simulés.                                 | Aucun échange avec un serveur Supabase réel pendant cet audit.                                        |
| Accessibilité, langues et navigation        | Tests de composants et d’accessibilité existants, clés FR/EN, compilation et contrôles navigateur.                                      | Le contraste visuel et les technologies d’assistance nécessitent une recette dédiée.                  |

Les corrections ont des tests de régression ciblés. Les cas de recherche
ignorée, région erronée, actions disponibles sans progression, total d’épisodes,
pays des recommandations, pagination du calendrier, rappels entre profils et
rafraîchissement automatique ont été reproduits avant modification du code.

## Second lot : priorités traitées

1. **Alertes de disponibilité par profil.** Chaque alerte conserve désormais
   les offres dont elle a déjà été informée, dans le stockage local, à côté du
   cache partagé. La vérification d’un profil ne consomme plus le changement
   attendu par un autre. Les alertes créées avant ce changement partent de
   l’instantané partagé une seule fois, donc un changement déjà absorbé par
   un autre profil avant la mise à jour reste perdu. Test dans
   `availability-monitor.test.ts`.
2. **Calendrier : films de la bibliothèque.** Les films non vus et non
   abandonnés de la bibliothèque sont consultés directement, sans dépendre du
   rang de popularité du flux des sorties. Les films des années passées sont
   ignorés. Les séries gardent leurs deux dernières saisons.
3. **Accueil résistant aux pannes partielles.** Les sept rubriques sont
   chargées indépendamment. Une rubrique en échec reste vide, un bandeau
   propose de la relancer. L’erreur complète n’apparaît que si les sept échouent.
4. **Grandes bibliothèques.** L’affichage était déjà virtualisé et `/library`
   déjà paginée côté serveur. Seule la passe de filtrage des vues Films et
   Séries grandit avec la bibliothèque : un test la mesure sur 10 000 titres.
   Aucune pagination des sections par progression n’a été ajoutée ; la mesure
   dans la fenêtre native reste à faire.
5. **Recette automatisée.** Un test Rust rejoue sur une base migrée : voir deux
   épisodes, annuler l’un, répéter l’annulation sans nouvelle entrée, exporter,
   restaurer, comparer. Les parcours nécessitant la fenêtre Tauri, deux appareils
   ou de vraies notifications système restent manuels.

La nouvelle déduplication des rappels utilise des clés locales par profil. Les
anciennes clés globales ne sont pas attribuables à un profil ; un rappel encore
dans sa fenêtre d’envoi peut donc être présenté une fois de plus après mise à
jour. Aucune donnée de bibliothèque ni migration de base n’est modifiée.

## Validation

Les résultats détaillés de la dernière validation sont consignés à la fin de
ce document une fois les contrôles terminés.

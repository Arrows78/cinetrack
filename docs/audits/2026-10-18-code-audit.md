# Audit du code et refactorisation

Audit du 18 octobre 2026 après le lot décrit dans
`2026-10-18-functional-audit.md`. Cinq lectures indépendantes (Rust
bibliothèque et progression, Rust statistiques, synchronisation et
sauvegarde, Rust listes, profils et intégrations, couche de données
TypeScript, pages et composants). Chaque constat a été vérifié dans le code
avant correction ; un constat s'est révélé faux (voir plus bas). Aucune
exécution dans la fenêtre Tauri.

## Corrigé

| Zone                  | Défaut                                                                                                                                                                                                                                                                                                                                       | Correction                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates                 | Les instants valides mais non normalisés (`+01:00`, date seule) étaient stockés tels quels, puis comparés comme des chaînes : ordre de l’historique, bornes d’année et `MAX(updated_at)` faux.                                                                                                                                               | Forme canonique RFC 3339 UTC à l’écriture (progression, import de sauvegarde, synchronisation, import TV Time).                                                         |
| Séries                | Les revisionnages d’une série survivaient au décochage de tous ses épisodes et « ressuscitaient » ensuite.                                                                                                                                                                                                                                   | Supprimés avec le compteur remis à zéro dans la même transaction, sans nouvelle ligne de journal.                                                                       |
| Statistiques          | Le genre favori de l’année comptait des visionnages annulés. Le prévisionnel comptait des séries abandonnées ou terminées. La plus longue série de jours était tronquée à 400 jours.                                                                                                                                                         | Règle d’état courant partagée, prévisionnel limité aux séries en cours, séries de jours calculées sur tout l’historique.                                                |
| Synchronisation       | Un document distant pouvait écraser la ligne d’un autre profil.                                                                                                                                                                                                                                                                              | Garde sur `profile_id` dans les cinq upserts.                                                                                                                           |
| Restauration          | Les préférences restaurées n’étaient pas validées. Le curseur et les marqueurs d’amorçage de synchronisation survivaient à la purge, ce qui créait une divergence silencieuse avec le cloud. Le lien de compte d’un profil était remplacé.                                                                                                   | Préférences assainies, curseurs réinitialisés, lien local conservé.                                                                                                     |
| Bibliothèque          | Ajout « à voir » hors verrou (course avec le statut automatique), métadonnées écrasées par un résumé partiel, statut TMDB effacé par une valeur absente, « Ne plus recommander » non idempotent.                                                                                                                                             | Transaction unique, valeurs existantes conservées, écriture idempotente.                                                                                                |
| OAuth                 | Un client muet bloquait l’écouteur local.                                                                                                                                                                                                                                                                                                    | Un fil par connexion, délais de lecture et d’écriture de 2 s.                                                                                                           |
| Genres                | Les genres étaient stockés dans deux langues selon l’origine du titre (détail localisé, listes en anglais), ce qui faussait les affinités, les statistiques et le filtre de genre.                                                                                                                                                           | Résolution depuis l’identifiant vers le libellé canonique.                                                                                                              |
| Synchronisation cloud | Elle ne démarrait qu’au lancement : une connexion tardive restait sans synchronisation, et la déconnexion laissait le canal ouvert. Une erreur après un pull laissait l’interface périmée.                                                                                                                                                   | Démarrage et arrêt pilotés par l’utilisateur connecté, invalidation dans un `finally`, invalidation de la langue et de la région partagée avec les préférences locales. |
| Interface             | Calendrier de suivi vide sans bouton pour en sortir, filtre de dates de l’historique en UTC, actions invisibles mais cliquables au tactile, double envoi des filtres sauvegardés, requête TMDB à chaque frappe de durée, jeton et mot de passe du coffre conservés après usage, statuts TMDB bruts, requête inutile sans liste intelligente. | Corrigés, chacun avec un test.                                                                                                                                          |
| Alertes               | Les clés locales d’alerte supprimée n’étaient pas purgées.                                                                                                                                                                                                                                                                                   | Purge au retrait ou à la désactivation.                                                                                                                                 |

## Refactorisation

- Les modules de tests intégrés ont quitté `library/repository.rs`,
  `progress/repository.rs`, `backup/repository.rs`, `sync/service.rs` et
  `stats/mod.rs` : environ 12 000 lignes déplacées vers des fichiers de
  tests voisins. Les fichiers de production tombent à 88, 574, 714, 918 et
  1 309 lignes.
- Trente copies de `migrated_pool()` remplacées par `test_support.rs`.
- `settings-page.tsx` passe de 863 à 236 lignes : `ProfilesCard` (avec son
  hook d’édition), `AppearanceCard` et `NotificationsCard`. Les deux
  formulaires d’édition de profil dupliqués sont devenus un seul composant.
- Toutes les clés `localStorage` `cinetrack.*` sont dans
  `shared/constants/local-storage-keys.ts`, valeurs inchangées, avec un test
  contre les doublons.

## À décider ou à faire

Ces points demandent un choix produit, une migration ou une mesure native.

1. **Code PIN d’un profil lié à un compte.** `set_active_profile` dispense du
   PIN quand l’appelant renvoie l’identifiant de compte du profil, lequel
   est renvoyé en clair par `list_profiles`. Une vraie preuve exige de
   valider le jeton Clerk côté Rust.
2. **Aucune limite d’essais sur le PIN**, et un hachage SHA-256 sans coût.
   Il faut un compteur d’échecs par profil (colonne ou table, donc une
   migration) et une fonction de dérivation lente.
3. **Jeton TMDB.** Il est transmis à chaque commande et peut être embarqué
   dans le bundle via `VITE_TMDB_API_TOKEN`. Le placer dans l’état Rust.
   Durcir aussi `is_valid_tmdb_path` (`%2e%2e`, `\`) par liste blanche.
4. **Alertes de disponibilité.** `toggle_availability_alert` supprime l’alerte
   au second appel : remplacer par des commandes explicites
   « définir l’alerte ».
5. **Import TV Time.** Séries homonymes fusionnées (clé par nom plutôt que par
   identifiant), phases concurrentes qui rendent l’annulation non
   déterministe, dates et taille du lot non validées côté Rust, revisionnages
   de films perdus.
6. **Validation des profils.** Longueur du nom, avatar libre, nombre de profils,
   liaison de compte sans PIN ni transaction.
7. **Migrations.** Aucune garde quand `user_version` dépasse la dernière
   migration connue (base ouverte par une version plus récente).
8. **Interface.** L’annulation d’une entrée d’historique et le décochage d’un
   épisode (surtout par balayage) n’ont pas de confirmation ; les confettis
   partent avant le résultat de l’écriture ; le filtre de type de
   l’historique s’applique aux pages déjà chargées ; les filtres sauvegardés
   sont partagés entre `/library`, `/movies` et `/series` ; la pagination
   serveur omet les titres présents uniquement dans une liste ; le delta
   annuel des statistiques est faux pendant le chargement.
9. **Écart d’interprétation.** Le prévisionnel ne compte plus que les séries
   « en cours » : à confirmer si les séries « à voir » doivent y figurer.

## Constat écarté

La construction du contexte des listes intelligentes ne lisait pas un
instantané de la mauvaise région : son seul appelant filtre déjà sur la région
des préférences. Aucune modification.

## Prochaines refactorisations

- Registre unique des types d’entités de synchronisation (cinq listes
  parallèles à garder cohérentes à la main) et test de parité avec
  `PROFILE_SCOPED_TABLES`.
- Découper `sync/service.rs` (amorçage, file d’envoi, application) et
  déplacer réellement l’export et l’import dans `backup/export.rs` et
  `backup/import.rs`.
- Un seul helper d’insertion de `viewing_events` (quatre copies) et un
  fragment SQL partagé pour « épisodes réguliers vus » (quatre copies).
- Charger une fois le journal d’événements actifs pour la page Statistiques
  (sept requêtes recalculent le même CTE).
- Couche unique de lecture des détails TMDB avec cache partagé (calendrier,
  prochains épisodes, « Ce soir », import TV Time) et module d’invalidation
  par domaine.
- Découper `tvtime-import-service.ts` (792 lignes) en appariement,
  application et annulation.

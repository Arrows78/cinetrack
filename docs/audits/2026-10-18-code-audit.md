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

## Second lot : points traités

- **PIN.** Compteur d’échecs par profil avec verrouillage progressif (réponse
  429, message traduit), hachage Argon2id avec reprise transparente des
  anciens hachages SHA-256, fin de la dispense de PIN pour un profil lié à un
  compte (le sélecteur de profil demande désormais le PIN), identifiant de
  compte retiré de `list_profiles`. Migration 27. Les compteurs ne sont pas
  restaurés avec une sauvegarde.
- **Jeton TMDB** conservé dans l’état Rust (`set_tmdb_token`), plus transmis à
  chaque commande, absent du bundle de production, chemins TMDB limités par
  liste blanche.
- **Alertes de disponibilité** : `set_availability_alert` idempotent remplace
  la bascule.
- **Profils** : nom, avatar et nombre limités, liaison de compte dans une
  transaction. **Préférences** : une valeur hors bornes retombe sur son défaut,
  compteur de génération contre les lectures périmées. **Migrations** : une
  base plus récente que l’application bloque le démarrage.
- **Import TV Time** : lot borné et validé côté Rust ; côté TypeScript,
  regroupement par identifiant de série, phases séquencées (liste de suivi en
  dernier), détails relus après un appariement TVDB, service découpé.
- **Interface** : confirmation de l’annulation d’historique et du décochage
  d’un épisode noté ou balayé, confettis après succès de l’écriture, filtres
  sauvegardés limités à leur page, titres « liste seule » visibles sur
  `/library`, delta annuel des statistiques fiable, tâches de journal, cache
  d’images et sauvegarde automatique sans course ni promesse non gérée.
- **Refactorisation** : registre unique des entités de synchronisation avec
  tests de parité, `sync/service.rs` de 1 309 à 117 lignes de façade,
  export et import de sauvegarde dans leurs modules, helpers partagés pour
  `viewing_events`, `library_items` et « épisodes réguliers vus », recherche
  par clés via `json_each` (la troncature silencieuse à 500 est remplacée par
  une erreur au-delà de 5 000), couche partagée de lecture des détails TMDB,
  module unique d’invalidation, registre des clés `localStorage`.

## Reste à faire

1. **Filtre de type de l’historique côté Rust.** Ajouter `mediaType` aux
   filtres de la commande ; en attendant, l’interface charge les pages
   suivantes (6 au plus) tant que la liste filtrée est vide.
2. **Page Statistiques.** Les sept requêtes recalculent le même CTE
   d’événements actifs. Les mutualiser demande un cache avec invalidation
   (y compris après `sync::apply`).
3. **Tri par titre** insensible à la casse et aux accents : curseur, index et
   tests de plans de requête à changer ensemble.
4. **Importeur TV Time Rust** : migrer sa copie de l’insertion
   `viewing_events` vers le helper partagé.
5. **Littéral `"default"`** encore présent dans `preferences` et les tests de
   `lists`.
6. **À confirmer :** `s_id` d’un export TV Time est bien l’identifiant TheTVDB ;
   le prévisionnel ne compte que les séries « en cours » ; « date de
   visionnage personnalisée » d’un épisode est détectée par un écart de plus
   de 60 s avec la création (heuristique).
7. **Recette native** : les parcours PIN verrouillé, connexion tardive et
   restauration sur un profil synchronisé n’ont pas été exercés dans la
   fenêtre Tauri.

## Constat écarté

La construction du contexte des listes intelligentes ne lisait pas un
instantané de la mauvaise région : son seul appelant filtre déjà sur la région
des préférences. Aucune modification.

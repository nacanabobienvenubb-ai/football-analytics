# PitchLab — Analyse statistique du football

Site d'analyse sportive et éducative (aucun conseil de pari). Cloudflare Workers + D1, interface HTML/JS sans étape de compilation. Le nom « PitchLab » se change dans `wrangler.toml` (`SITE_NAME`) et dans `public/index.html`.

## Ce que contient la version 2
- **Analyse de match** : Poisson (65 %) + Elo (35 %), forme récente, buts attendus, 5 scores plausibles, carte de chaleur des scores, niveau de confiance et marge indicative. Probabilités totalisant exactement 100 %.
- **Comparateur d'équipes** (public, gratuit) : points, buts, domicile/extérieur, Elo, tendances (sans but encaissé, les deux marquent, plus de 2,5 buts), forme, confrontations directes.
- **Joueurs** : minutes, titularisations vs entrées en jeu, buts, passes décisives, tirs, valeurs par 90 minutes (à partir de 180 min), comparaison de deux joueurs.
- **Entraîneurs** : période, matchs, bilan V-N-D, points par match. Aucune analyse tactique n'est inventée : seule une note de style fournie à l'import est affichée.
- **Comptes** : PBKDF2, sessions HttpOnly, changement de mot de passe, **récupération par code à usage unique** remis par l'administrateur (valable 1 h, invalide les anciennes sessions). Aucun service d'email n'est utilisé (gratuit et sans configuration).
- **Essais gratuits** : 5 analyses décomptées côté serveur, 3 créations de compte max par connexion et par jour.
- **Premium** : 5 850 FCFA (≈ 10 USD, conversion indicative), jamais accordé sans validation de l'administrateur. Orange Money manuel ; crypto désactivée tant que vous n'avez pas renseigné vos informations (aucune adresse n'est préremplie).
- **Administration** : paiements, utilisateurs, codes de récupération, configuration, imports CSV (matchs, joueurs, entraîneurs), compteur d'erreurs.
- **Données de démonstration fictives** (équipes, joueurs, entraîneurs inventés) tant qu'aucun import réel n'a été fait.

## Non inclus (volontairement)
xG réels de tirs, compositions/blessures/suspensions, écussons et photos officiels, données en direct, prochains matchs, récupération par email, CAPTCHA. Ces éléments exigent des sources ou services tiers vérifiés ; rien n'est inventé à leur place.

## Importer des données réelles
**CSV** : Administration → Importer. En-têtes exacts par type :
- Matchs : `date,competition,home,away,home_goals,away_goals` (date `AAAA-MM-JJ`)
- Joueurs : `name,team,position,season,minutes,starts,sub_apps,goals,assists,shots`
- Entraîneurs : `name,team,start_date,end_date,matches,wins,draws,losses,style_note`

Les matchs en double (même date, mêmes équipes) sont ignorés. Dès 20 matchs importés, ils remplacent la démonstration.

**StatsBomb Open Data** (gratuit, licence à respecter : attribution obligatoire, voir le dépôt `statsbomb/open-data`). Sur un ordinateur ou Termux avec Node 20+ :
1. `git clone https://github.com/statsbomb/open-data`
2. Repérez `competition_id` et `season_id` dans `open-data/data/competitions.json`.
3. `node tools/statsbomb_to_csv.mjs open-data <competition_id> <season_id> .`
4. Importez les trois fichiers `statsbomb_*.csv` dans l'administration en cochant « Fichier issu de StatsBomb » (le site affiche alors la mention d'attribution).
Limites : le script a été testé uniquement sur un jeu synthétique au format StatsBomb, pas sur les vrais fichiers. Les minutes d'un joueur resté jusqu'au bout sont comptées jusqu'à 90 min (les prolongations ne sont pas gérées). Les buts/passes/tirs ne sont comptés que si le fichier d'événements du match est présent.

## Tester sur ordinateur (facultatif)
`npm install` puis `npm test` (22 tests, Node 22 requis pour le simulateur de base). `node tools/devserver.mjs` lance le vrai code du site avec une base SQLite en mémoire (http://localhost:8787, sans compte Cloudflare).

## Déploiement depuis Android (GitHub + Cloudflare)
1. Créez un compte sur github.com et un compte sur dash.cloudflare.com (gratuits).
2. Sur GitHub : **New repository** (privé conseillé) → **uploading an existing file** → envoyez tous les fichiers du ZIP décompressé (dossiers `src`, `public`, `migrations`, `data`, `test` et fichiers à la racine). Astuce : activez « Version pour ordinateur » dans votre navigateur.
3. Cloudflare → **Storage & Databases → D1 → Create database**, nom `football-db`. Copiez son **Database ID**.
4. Dans GitHub, modifiez `wrangler.toml` (icône crayon) : remplacez `REMPLACER_PAR_VOTRE_DATABASE_ID` par cet identifiant, puis **Commit**.
5. Cloudflare → ouvrez la base `football-db` → onglet **Console** → collez le contenu de `migrations/0001_init.sql` → **Execute**, puis faites la même chose avec `migrations/0002_v2.sql`. (Si vous avez déjà déployé la v1 : n'exécutez que `0002_v2.sql`.)
6. Cloudflare → **Workers & Pages → Create → Import a repository** → choisissez votre dépôt. Commande de déploiement : `npx wrangler deploy`. Lancez le déploiement ; l'adresse `…workers.dev` s'affiche.
7. **Devenir administrateur** : ouvrez le site, créez votre compte (faites-le avant de partager le lien). Puis dans la Console D1, exécutez :
   `UPDATE users SET role='admin' WHERE email='votre@email.com';`
   Reconnectez-vous : le menu « Administration » apparaît.

## Configurer les paiements
- **Orange Money** : actif par défaut avec le numéro communiqué. Modifiable dans Administration → Configuration.
- **Crypto** : renseignez adresse/lien, réseau, cryptomonnaie, montant, instructions, puis mettez `crypto_enabled` à `1`. N'utilisez que **votre** adresse réelle.
- **Valider un paiement** : Administration → Paiements. Comparez la référence avec votre historique Orange Money / votre portefeuille, puis **Valider** ou **Refuser**. Rien n'est vérifié automatiquement.

## Tester le parcours
1. Créez un compte test → 5 analyses gratuites. 2. Faites 5 analyses : le compteur descend. 3. La 6e est refusée (message + lien vers Premium). 4. Envoyez une référence depuis « Premium ». 5. En admin, validez : le compte passe en premium. 6. Une 6e analyse fonctionne.

## Importer des données (CSV)
En-têtes exacts : `date,competition,home,away,home_goals,away_goals` (date `AAAA-MM-JJ`). Administration → Importer. Au moins 20 matchs pour remplacer la démo. Chaque import s'ajoute aux précédents.

## Mettre à jour le site
Remplacez les fichiers dans GitHub (envoi de fichiers, même nom = remplacement) **sans écraser `wrangler.toml`** si vous y avez mis votre Database ID. Cloudflare redéploie automatiquement. Les nouvelles migrations (`0002…`) s'exécutent dans la Console D1.

## Récupération de compte
L'utilisateur vous contacte (WhatsApp, etc.). Administration → Utilisateurs → « Code de récupération », transmettez le code. L'utilisateur l'entre sur la page Connexion → « Mot de passe oublié » avec son email.

## Ce que vous devez faire vous-même
Créer les comptes GitHub et Cloudflare ; créer la base D1 et coller son identifiant dans `wrangler.toml` ; exécuter les migrations dans la Console D1 ; créer votre compte puis vous promouvoir administrateur (requête SQL ci-dessus) ; vérifier chaque paiement Orange Money avant de valider ; renseigner vos informations crypto si vous l'activez ; vérifier les quotas gratuits Cloudflare.

## Coûts et limites à vérifier
Les offres gratuites de Workers et D1 ont des quotas quotidiens (requêtes, lectures/écritures). Vérifiez les limites actuelles sur la documentation Cloudflare avant le lancement : une forte fréquentation peut exiger le plan payant. Les polices viennent de Google Fonts (gratuit).

## Sécurité (résumé)
Statut premium et compteur uniquement en base, vérifiés à chaque requête ; rôle admin vérifié en base ; secrets absents du code ; messages d'erreur génériques ; références de paiement uniques. Risque à vérifier au déploiement : le hachage PBKDF2 (100 000 itérations) peut dépasser la limite de temps processeur du plan gratuit Workers ; si la création de compte ou la connexion échoue avec une erreur de limite CPU, signalez-le (réduire les itérations ou passer au plan payant). Limites connues : pas de vérification d'email ni de CAPTCHA (la limite par IP réduit les abus sans les empêcher) ; pas de limitation générale des requêtes — activez les règles de limitation de débit/WAF de Cloudflare.

# Sky Store

E-commerce de cartes du ciel personalisees et de photos astrophotographie.

---

## Installation

### 1. Cloner / copier le projet

```bash
git clone <repo-url>
cd sky-store
```

### 2. Installer les dependances

```bash
npm install
```

### 3. Configurer l'environnement

```bash
cp .env.example .env
```

Editez `.env` et remplacez les valeurs necessaires. Le projet fonctionne en mode **simulation** si les cles ne sont pas configurees.

### 4. Lancer le serveur

```bash
npm start
# ou en mode developpement avec rechargement automatique:
npm run dev
```

Le site est accessible sur **http://localhost:3000**

---

## Structure des dossiers

```
sky-store/
├── server.js              # Point d'entree Express
├── .env.example            # Variables d'environnement (copier vers .env)
├── public/
│   ├── css/style.css       # Feuille de styles principale
│   ├── js/app.js           # Logique frontend
│   └── images-astro/        # Vos photos astrophotographie (deposez vos images ici)
├── storage/                 # Fichiers prives (hors /public)
│   ├── downloads/           # PDFs generes apres paiement
│   ├── generated/           # Cartes du ciel generees (PNG + PDF)
│   └── thumbnails/           # Miniatures photos
├── services/
│   ├── astro-engine.js      # Donnees astronomiques (modifiable pour API reelle)
│   ├── sky-map-gen.js       # Rendu visuel de la carte du ciel
│   ├── pdf-export.js        # Generation PDF
│   ├── stripe-service.js    # Paiement Stripe (mode test si cle absente)
│   ├── email-service.js     # Emails transactionnels (mock si non configure)
│   ├── photo-gallery.js     # Gestion de la galerie photos
│   └── database.js          # Schema SQLite
├── routes/
│   ├── users.js            # Authentification
│   ├── products.js         # Produits et photos
│   ├── cart.js            # Panier et logique bonus
│   └── orders.js          # Commandes, paiement, telechargement
└── templates/             # Pages HTML
```

---

## Depot des photos astrophotographie

1. Copiez vos images (JPG, PNG, WebP) dans :
   ```
   public/images-astro/
   ```
2. Au prochain demarrage du serveur, les miniatures sont generez automatiquement et les photos apparaissent dans la galerie.
3. Pour rescanner manuellement :
   ```bash
   npm run scan-photos
   ```

Pour ajouter des metadonnees (titre, description, prix, categorie), editez :
```
data/photos-meta.json
```

---

## Logique commerciale : 1 photo gratuite

- Quand une carte du ciel est dans le panier, le client peut choisir 1 photo gratuite parmi la galerie.
- La photo gratuite s'ajoute au panier avec le prix 0$.
- Apres paiement, le fichier est accessible dans l'espace client.

---

## Variables d'environnement

| Variable | Description | Defaut |
|---|---|---|
| `PORT` | Port du serveur | `3000` |
| `SESSION_SECRET` | Secret pour les sessions | _(obligatoire, sans fallback)_ |
| `CORS_ALLOWED_ORIGINS` | Origines CORS autorisees (CSV) | `http://localhost:3000,http://127.0.0.1:3000` |
| `STRIPE_PUBLISHABLE_KEY` | Cle publique Stripe | _(absent = mode test)_ |
| `STRIPE_SECRET_KEY` | Cle privee Stripe | _(absent = mode test)_ |
| `STRIPE_WEBHOOK_SECRET` | Secret de signature webhook Stripe | _(absent = mode test)_ |
| `STRIPE_WEBHOOK_PUBLIC_BASE_URL` | URL publique stable pour Stripe webhooks | `BASE_URL` |
| `STRIPE_MODE` | `test` ou `production` | `test` |
| `GEOCODE_API_KEY` | Cle API geocodage | _(absent = mode mock)_ |
| `SENDGRID_API_KEY` | Cle SendGrid | _(absent = mode test)_ |
| `SMTP_HOST` | Serveur SMTP | _(absent = mode test)_ |
| `DEFAULT_TENANT_ID` | Tenant par defaut | `public` |
| `REQUIRE_BOOTSTRAP_ADMIN_SIGNUP` | Verrouille la 1ere inscription sur `ADMIN_BOOTSTRAP_EMAIL` | `false` |
| `ENABLE_SUBDOMAIN_TENANT` | Active le tenant via sous-domaine | `false` |

---

## Recuperation acces admin (3 etapes)

Contexte: en environnement tunnel (`*.trycloudflare.com`), le sous-domaine pouvait etre interprete comme tenant et provoquer un faux "Identifiants invalides".

1. Verifiez dans `.env`:
   - `DEFAULT_TENANT_ID=public`
   - `ENABLE_SUBDOMAIN_TENANT=false` (single-tenant recommande)
2. Redemarrez le serveur (`npm start`).
3. Si le mot de passe admin reste inconnu, reinitialisez-le sans l'ecrire dans un ticket:
   ```bash
   ADMIN_EMAIL=<email-admin> ADMIN_NEW_PASSWORD=<nouveau-secret-fort> npm run admin:reset-password
   ```
   Ou (compatible PowerShell / Windows):
   ```powershell
   npm run admin:reset-password -- --email "<email-admin>" --password "<nouveau-secret-fort>"
   ```

Notes securite:
- Le secret ne doit pas etre publie dans les commentaires/tickets.
- Le script exige un mot de passe de 12 caracteres minimum et ne fonctionne que pour un compte admin existant.

## Bootstrap admin (inscription initiale)

- Si `REQUIRE_BOOTSTRAP_ADMIN_SIGNUP=true`: tant qu'aucun admin **verifie** n'existe sur le tenant, seule l'adresse `ADMIN_BOOTSTRAP_EMAIL` peut s'inscrire.
- Le tout premier compte bootstrap est cree admin et verifie immediatement.
- Configurez `ADMIN_BOOTSTRAP_EMAIL` dans `.env` avant la premiere inscription (quand le verrou bootstrap est actif).

## Reset environnement TEST

Pour nettoyer les utilisateurs/commandes/fichiers generes de test:

```bash
npm run reset:test-env -- --tenant public --yes
```

Options utiles:
- `--drop-bootstrap-admin` : supprime aussi le compte admin bootstrap.
- `--keep-files` : garde les fichiers deja generes dans `storage/`.
- Le script affiche explicitement `ATTENTION: compte bootstrap conserve (...)` quand l'email bootstrap est preserve. Dans ce cas, cet email restera indisponible a la re-inscription tant que `--drop-bootstrap-admin` n'est pas passe.

---

## Mode test / Mode production

### Mode test (defaut)
- Paiement simule : apres 1.5s, redirection automatique vers succes
- Emails logs dans la console
- Geocodage : villes mock predefinies

### Mode production
1. Remplacez `STRIPE_SECRET_KEY` et `STRIPE_PUBLISHABLE_KEY` par vos cles Stripe reelles.
2. Configurez `STRIPE_WEBHOOK_SECRET`.
3. Configurez `STRIPE_WEBHOOK_PUBLIC_BASE_URL` avec une URL HTTPS stable (eviter `trycloudflare.com`).
4. Configurez `SENDGRID_API_KEY` ou `SMTP_*` pour les emails.
5. Configurez `GEOCODE_API_KEY` (ex: Nominatim ou Google Maps) pour le geocodage.
6. Changez `SESSION_SECRET` par une longue chaine aleatoire (32+ caracteres).
7. Definissez `CORS_ALLOWED_ORIGINS` avec les domaines front attendus (CSV).
8. Passez `NODE_ENV=production`.
9. Lancez:
   ```bash
   npm run check:production-readiness
   ```

### Regle de securite secrets
- Ne jamais poster de cles Stripe/SMTP/SendGrid en clair dans des tickets, chats ou captures.
- Utiliser uniquement `.env` local (ignore par git) et le gestionnaire de secrets de la plateforme cible.
- En cas d'exposition d'une cle: rotation immediate + invalider l'ancienne.

---

## Branches futures

### API astronomique reelle
Pour remplacer le mock astronomique par des donnees reelles, modifiez :
```javascript
// services/astro-engine.js
// Rechercher "MODE REEL" et decommenter la section adaptee
```

### API geocodage reelle
Pour brancher un vrai geocodage :
```javascript
// services/astro-engine.js > geocodeLocation()
// Decommenter la section "MODE REEL" et ajouter votre cle API
```

### Base de donnees PostgreSQL
Pour passer de SQLite a PostgreSQL :
1. Installez `pg` et configurez `DATABASE_URL`.
2. Adaptez les requetes dans `services/database.js` (syntaxe proche de SQLite, quelques ajustements requis).

---

## Generer les PDF sans `pdfkit` (optionnel)

Le module utilise `pdfkit` pour generer le PDF. Si vous ne pouvez pas l'installer (environement restreint), le systeme genere quand meme le PNG haute resolution. Le PDF est optionnel.

Pour installer pdfkit :
```bash
npm install pdfkit
```

---

## Depannage

**Erreur `canvas`:**
```bash
# Ubuntu/Debian:
sudo apt-get install libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev build-essential g++

# macOS:
brew install cairo jpeg giflib
npm install canvas
```

**Stripe ne redirige pas :** Verifiez que `BASE_URL` dans `.env` correspond a votre URL publique en production.

**Photos non affichees :** Verifiez que les images sont dans `public/images-astro/` et que le serveur a les droits de lecture.

---

## Licence

Proprietaire — Tous droits reserves.

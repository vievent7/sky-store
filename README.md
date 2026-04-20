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
| `SESSION_SECRET` | Secret pour les sessions | `dev_secret...` |
| `STRIPE_PUBLISHABLE_KEY` | Cle publique Stripe | _(absent = mode test)_ |
| `STRIPE_SECRET_KEY` | Cle privee Stripe | _(absent = mode test)_ |
| `STRIPE_MODE` | `test` ou `production` | `test` |
| `GEOCODE_API_KEY` | Cle API geocodage | _(absent = mode mock)_ |
| `SENDGRID_API_KEY` | Cle SendGrid | _(absent = mode test)_ |
| `SMTP_HOST` | Serveur SMTP | _(absent = mode test)_ |
| `ADMIN_CODE` | Code d'acces admin | _(defaut: `admin123`)_ |

---

## Mode test / Mode production

### Mode test (defaut)
- Paiement simule : apres 1.5s, redirection automatique vers succes
- Emails logs dans la console
- Geocodage : villes mock predefinies

### Mode production
1. Remplacez `STRIPE_SECRET_KEY` et `STRIPE_PUBLISHABLE_KEY` par vos cles Stripe reelles.
2. Configurez `SENDGRID_API_KEY` ou `SMTP_*` pour les emails.
3. Configurez `GEOCODE_API_KEY` (ex: Nominatim ou Google Maps) pour le geocodage.
4. Changez `SESSION_SECRET` par une longue chaine aleatoire.
5. Changez `ADMIN_CODE`.
6. Passez `NODE_ENV=production`.

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

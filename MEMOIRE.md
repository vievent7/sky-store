# Sky Store — Mémoire de session

## Où on en est

### Le flow en 3 étapes

**`/choose-sky`** (étape 1 sur 3)
- Sphèrerdérale interactive (D3-Celestial), container 594×594px
- Formulaire : date, heure, lieu (géocodage Nominatim — OpenStreetMap, fonctionne pour tout lieu)
- Bouton "Générer" → sphère affiche le vrai ciel
- Auto-capture après 650ms → l'image apparaît en petit (200px) en dessous + bouton "Préparer à construire votre carte"
- Bouton "Capturer cette vue" → capture manuelle (au cas où)
- Stockage : sessionStorage (sky_capture, sky_date, sky_time, sky_lat, sky_lng, sky_location)

**`/build-map`** (étape 2 sur 3)
- Affiche la capture en haut à gauche (zone .capture-preview, 300×300px)
- Formulaire : titre, sous-titre, style (sombre/clair/artistique), orientation (vertical/horizontal)
- "Générer l'apercu" → remplace la zone capture avec la carte complète (titre + sous-titre + date/lieu superposés sur l'image)
- "Ajouter au panier" → enregistre en sessionStorage cart et redirige vers /cart

**`/homepage`**
- Sphèrerdérale display-only dans le hero, 540×540px, texte à gauche, sphère à droite
- Sphère fixe (controls: false, interactive: false) — pas d'interaction possible
- Stars: limit 4.5, opacity 0.75, size 9, constellations/mw/ecliptic opacity 0.5
- Glow halo ajouté via rendered callback
- Animation d'apparition (sphereFadeIn 1.4s)

### Géocodage — RÉEL
- `astro-engine.js` → `geocodeLocation()` → Nominatim (OpenStreetMap)
- Fonctionne pour n'importe quel lieu dans le monde
- Retourne lat, lng, display_name

### Commandes
```bash
cd sky-store
npm start    # port 3000
```

### Fichiers modifiés
- `templates/choose-sky.html` — nouvelle page complète
- `templates/build-map.html` — réécrite proprement
- `templates/index.html` — sphère homepage
- `services/astro-engine.js` — Nominatim geocoding
- `server.js` — routes /choose-sky, /build-map

### Prochaine étape naturelle
- Étape 3 : `/cart` — afficher les items du panier, passer la commande
- Intégrer Stripe pour le paiement
- Le panier existe déjà dans l'ancien site (`/cart`) — à merger avec le nouveau flow

### Ce qu'on ne touche pas (encore)
- `create-map.html` — l'ancienne page reste intacte
- Moteur SVG premium de l'ancienne page
- `/cart` actuel du site

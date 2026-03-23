// ══════════════════════════════════════════════════════════════════════
// KISOA — Google Apps Script SÉCURISÉ v2
// ══════════════════════════════════════════════════════════════════════
// INSTRUCTIONS :
// 1. Ouvrez script.google.com → ouvrez votre projet KISOA existant
// 2. Remplacez TOUT le code par ce fichier
// 3. Cliquez "Déployer" → "Gérer les déploiements"
// 4. Cliquez le crayon ✏️ → Version : "Nouvelle version" → Déployer
// 5. L'URL reste la même — pas besoin de la changer dans vos fichiers
// ══════════════════════════════════════════════════════════════════════

// ── CONFIGURATION ─────────────────────────────────────────────────────
const SECRET        = 'KISOA-MANDIMBI-2026'; // Clé secrète — ici uniquement
const MDP_ADMIN     = '1979';                 // Mot de passe admin — ici uniquement
const ESSAI_JOURS   = 1;                      // Durée essai sans promo
const PROMO_JOURS   = 2;                      // Durée essai avec promo

// ── POINT D'ENTRÉE POST ───────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    switch(data.type) {
      case 'inscription':    return repondre(enregistrerInscription(ss, data));
      case 'verif_essai':    return repondre(verifierEssai(ss, data));
      case 'gen_licence':    return repondre(genererLicence(ss, data));
      case 'verif_licence':  return repondre(verifierLicence(ss, data));
      case 'activation':     return repondre(enregistrerActivation(ss, data));
      case 'login_admin':    return repondre(loginAdmin(data));
      default:               return repondre({ok: false, error: 'Type inconnu'});
    }
  } catch(err) {
    return repondre({ok: false, error: err.message});
  }
}

// ── POINT D'ENTRÉE GET (test) ──────────────────────────────────────────
function doGet(e) {
  return repondre({status: 'KISOA API v2 active', date: new Date().toISOString()});
}

// ── HELPER RÉPONSE ────────────────────────────────────────────────────
function repondre(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HELPER HASH (même algo que dans l'appli pour compatibilité) ────────
function _h(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h).toString(36).toUpperCase().padStart(8,'0').slice(0,8);
}

// ── HELPER FEUILLE ────────────────────────────────────────────────────
function getSheet(ss, nom, entetes, couleur) {
  let sheet = ss.getSheetByName(nom);
  if (!sheet) {
    sheet = ss.insertSheet(nom);
    sheet.appendRow(entetes);
    sheet.getRange(1, 1, 1, entetes.length)
         .setFontWeight('bold')
         .setBackground(couleur)
         .setFontColor('#ffffff');
  }
  return sheet;
}

// ── LOGIN ADMIN ───────────────────────────────────────────────────────
// Le mot de passe n'est plus dans le HTML — il est vérifié ici
function loginAdmin(data) {
  if (!data.mdp) return {ok: false, error: 'Mot de passe manquant'};
  if (data.mdp === MDP_ADMIN) {
    // Retourner un jeton de session signé (valable 8h)
    const expire = Date.now() + 8 * 60 * 60 * 1000;
    const jeton  = _h(MDP_ADMIN + '|' + expire + '|' + SECRET);
    return {ok: true, jeton, expire};
  }
  return {ok: false, error: 'Mot de passe incorrect'};
}

// ── VÉRIFICATION JETON ADMIN ──────────────────────────────────────────
function jetonAdminValide(jeton, expire) {
  if (!jeton || !expire) return false;
  if (Date.now() > parseInt(expire)) return false;
  const attendu = _h(MDP_ADMIN + '|' + expire + '|' + SECRET);
  return jeton === attendu;
}

// ── INSCRIPTION (premier lancement éleveur) ───────────────────────────
// Ancre la date de début côté serveur — inviolable
function enregistrerInscription(ss, data) {
  if (!data.tel) return {ok: false, error: 'Téléphone manquant'};
  const tel = data.tel.replace(/\s/g, '');

  const sheet = getSheet(ss, 'Clients',
    ['Date', 'Prénom', 'Téléphone', 'Code Promo', 'Commercial', 'Statut', 'Essai (jours)', 'Debut (ISO)'],
    '#5D2E0C');

  // Chercher si déjà inscrit
  const col  = sheet.getRange('C:C').getValues().flat();
  const idx  = col.indexOf(tel);

  if (idx > 0) {
    // Déjà inscrit — retourner les infos existantes sans modifier
    const row        = sheet.getRange(idx + 1, 1, 1, 8).getValues()[0];
    const debutISO   = row[7] || row[0]; // colonne Debut (ISO) ou Date
    const codePromo  = row[3] !== '—' ? row[3] : '';
    const duree      = codePromo ? PROMO_JOURS : ESSAI_JOURS;
    const expiration = new Date(debutISO).getTime() + duree * 24 * 60 * 60 * 1000;
    const restants   = Math.ceil((expiration - Date.now()) / (24 * 60 * 60 * 1000));
    const licencie   = row[5] === '✅ Licencié';
    return {ok: true, deja_inscrit: true, debut: debutISO, restants, licencie, duree};
  }

  // Nouveau client
  const maintenant = new Date().toISOString();
  const duree      = data.codePromo ? PROMO_JOURS : ESSAI_JOURS;
  sheet.appendRow([
    new Date().toLocaleDateString('fr-FR'),
    data.prenom || '—',
    tel,
    data.codePromo || '—',
    data.codePromo || '—',
    'Essai',
    duree,
    maintenant
  ]);

  return {
    ok        : true,
    deja_inscrit: false,
    debut     : maintenant,
    restants  : duree,
    licencie  : false,
    duree
  };
}

// ── VÉRIFICATION ESSAI (à chaque ouverture de l'appli) ────────────────
// Retourne le nombre de jours restants basé sur la DATE SERVEUR
function verifierEssai(ss, data) {
  if (!data.tel) return {ok: false, error: 'Téléphone manquant'};
  const tel   = data.tel.replace(/\s/g, '');
  const sheet = ss.getSheetByName('Clients');
  if (!sheet) return {ok: false, error: 'Aucun client enregistré'};

  const col = sheet.getRange('C:C').getValues().flat();
  const idx = col.indexOf(tel);
  if (idx < 0) return {ok: false, error: 'Client non trouvé', inconnu: true};

  const row       = sheet.getRange(idx + 1, 1, 1, 8).getValues()[0];
  const licencie  = row[5] === '✅ Licencié';
  if (licencie) return {ok: true, licencie: true, restants: 999};

  const debutISO  = row[7] || row[0];
  const codePromo = row[3] !== '—' ? row[3] : '';
  const duree     = codePromo ? PROMO_JOURS : ESSAI_JOURS;
  const expiration= new Date(debutISO).getTime() + duree * 24 * 60 * 60 * 1000;
  const restants  = Math.ceil((expiration - Date.now()) / (24 * 60 * 60 * 1000));

  return {
    ok       : true,
    licencie : false,
    restants,
    expire   : restants <= 0,
    debut    : debutISO,
    duree
  };
}

// ── GÉNÉRATION LICENCE (depuis admin uniquement) ───────────────────────
// Le SECRET ne quitte plus jamais ce fichier
function genererLicence(ss, data) {
  // Vérifier que c'est bien l'admin qui appelle
  if (!jetonAdminValide(data.jeton, data.expire)) {
    return {ok: false, error: 'Non autorisé — reconnectez-vous'};
  }
  if (!data.tel) return {ok: false, error: 'Téléphone manquant'};

  const tel  = data.tel.replace(/\s/g, '');
  const code = 'KISOA-' + _h(tel) + '-' + _h(SECRET + '|' + tel);

  // Enregistrer la licence dans le Sheet
  const sheetLic = getSheet(ss, 'Licences',
    ['Date', 'Prénom', 'Téléphone', 'Code Licence', 'Commercial', 'Prix (Ar)'],
    '#1E6B2E');

  // Vérifier si licence déjà générée pour ce numéro
  const colTel = sheetLic.getRange('C:C').getValues().flat();
  if (!colTel.includes(tel)) {
    sheetLic.appendRow([
      new Date().toLocaleDateString('fr-FR'),
      data.prenom || '—',
      tel,
      code,
      data.commercial || '—',
      data.prix || 27000
    ]);
  }

  // Mettre à jour statut client
  const sheetCli = ss.getSheetByName('Clients');
  if (sheetCli) {
    const colCli = sheetCli.getRange('C:C').getValues().flat();
    const rowCli = colCli.indexOf(tel);
    if (rowCli > 0) sheetCli.getRange(rowCli + 1, 6).setValue('✅ Licencié');
  }

  return {ok: true, code};
}

// ── VÉRIFICATION LICENCE (depuis appli éleveur) ────────────────────────
// L'éleveur entre son code → on vérifie ici sans exposer le SECRET
function verifierLicence(ss, data) {
  if (!data.tel || !data.code) return {ok: false, error: 'Données manquantes'};

  const tel      = data.tel.replace(/\s/g, '');
  const attendu  = 'KISOA-' + _h(tel) + '-' + _h(SECRET + '|' + tel);
  const valide   = data.code.trim().toUpperCase() === attendu.toUpperCase();

  if (valide) {
    // Mettre à jour le statut dans le Sheet
    const ss2 = SpreadsheetApp.getActiveSpreadsheet();
    enregistrerActivation(ss2, {tel, prenom: data.prenom || '—', code: data.code, prix: data.prix || 27000});
  }

  return {ok: true, valide};
}

// ── ACTIVATION (mise à jour statut après paiement) ─────────────────────
function enregistrerActivation(ss, data) {
  const tel = (data.tel || '').replace(/\s/g, '');

  const sheetCli = ss.getSheetByName('Clients');
  if (sheetCli) {
    const col = sheetCli.getRange('C:C').getValues().flat();
    const row = col.indexOf(tel);
    if (row > 0) sheetCli.getRange(row + 1, 6).setValue('✅ Licencié');
  }

  const sheetLic = getSheet(ss, 'Licences',
    ['Date', 'Prénom', 'Téléphone', 'Code Licence', 'Commercial', 'Prix (Ar)'],
    '#1E6B2E');

  const colTel = sheetLic.getRange('C:C').getValues().flat();
  if (!colTel.includes(tel)) {
    sheetLic.appendRow([
      new Date().toLocaleDateString('fr-FR'),
      data.prenom || '—',
      tel,
      data.code  || '—',
      data.commercial || '—',
      data.prix  || 27000
    ]);
  }

  return {ok: true};
}

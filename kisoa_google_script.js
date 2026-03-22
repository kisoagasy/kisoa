// ══════════════════════════════════════════════════════════════════════
// KISOA — Google Apps Script
// À coller dans : script.google.com → Nouveau projet → Coller → Déployer
// ══════════════════════════════════════════════════════════════════════
// INSTRUCTIONS :
// 1. Ouvrez script.google.com
// 2. Créez un nouveau projet, nommez-le "KISOA"
// 3. Collez ce code entier
// 4. Cliquez "Déployer" → "Nouveau déploiement"
// 5. Type : Application Web
// 6. Accès : Tout le monde (anonyme)
// 7. Copiez l'URL générée
// 8. Collez-la dans kisoa_admin.html → Paramètres → URL Apps Script
// ══════════════════════════════════════════════════════════════════════

const SHEET_ID = ''; // Laissez vide — le script crée automatiquement les feuilles

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (data.type === 'inscription') {
      enregistrerInscription(ss, data);
    } else if (data.type === 'activation') {
      enregistrerActivation(ss, data);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ok: true}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ok: false, error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Permet de tester que le script est bien déployé
  return ContentService
    .createTextOutput(JSON.stringify({status: 'KISOA API active', date: new Date().toISOString()}))
    .setMimeType(ContentService.MimeType.JSON);
}

function enregistrerInscription(ss, data) {
  let sheet = ss.getSheetByName('Clients');
  if (!sheet) {
    sheet = ss.insertSheet('Clients');
    sheet.appendRow(['Date', 'Prénom', 'Téléphone', 'Code Promo', 'Commercial', 'Statut', 'Essai (jours)']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#5D2E0C').setFontColor('#ffffff');
  }
  
  // Vérifier si le numéro existe déjà
  const col = sheet.getRange('C:C').getValues().flat();
  if (col.includes(data.tel)) return; // Déjà enregistré
  
  const duree = data.codePromo ? 2 : 1;
  sheet.appendRow([
    new Date().toLocaleDateString('fr-FR'),
    data.prenom || '—',
    data.tel || '—',
    data.codePromo || '—',
    data.codePromo || '—', // Le commercial = le code promo
    'Essai',
    duree
  ]);
}

function enregistrerActivation(ss, data) {
  // Mettre à jour statut client
  let sheet = ss.getSheetByName('Clients');
  if (!sheet) return;
  
  const col = sheet.getRange('C:C').getValues().flat();
  const row = col.indexOf(data.tel) + 1;
  if (row > 0) {
    sheet.getRange(row, 6).setValue('✅ Licencié');
  }
  
  // Enregistrer dans feuille Licences
  let sheetLic = ss.getSheetByName('Licences');
  if (!sheetLic) {
    sheetLic = ss.insertSheet('Licences');
    sheetLic.appendRow(['Date', 'Prénom', 'Téléphone', 'Code Licence', 'Commercial', 'Prix (Ar)']);
    sheetLic.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1E6B2E').setFontColor('#ffffff');
  }
  
  sheetLic.appendRow([
    new Date().toLocaleDateString('fr-FR'),
    data.prenom || '—',
    data.tel || '—',
    data.code || '—',
    data.commercial || '—',
    data.prix || 27000
  ]);
}

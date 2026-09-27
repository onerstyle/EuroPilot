// ============================================================
// defaults.js — Données par défaut : catégories, comptes, moyens de paiement
// Toutes ces listes sont personnalisables dans les Paramètres.
// ============================================================

export const DEFAULT_CATEGORIES = [
  { id: 'logement', name: 'Logement', icon: '🏠', color: '#6366f1', type: 'expense', subs: ['Loyer', 'Crédit', 'Charges', 'Électricité', 'Gaz', 'Eau'] },
  { id: 'alimentation', name: 'Alimentation', icon: '🛒', color: '#22c55e', type: 'expense', subs: ['Courses', 'Marché', 'Boulangerie'] },
  { id: 'transport', name: 'Transport', icon: '🚌', color: '#0ea5e9', type: 'expense', subs: ['Transports en commun', 'Train', 'Taxi', 'Vélo'] },
  { id: 'voiture', name: 'Voiture', icon: '🚗', color: '#64748b', type: 'expense', subs: ['Entretien', 'Réparation', 'Parking', 'Péage', 'Contrôle technique'] },
  { id: 'carburant', name: 'Carburant', icon: '⛽', color: '#f97316', type: 'expense', subs: ['Essence', 'Diesel', 'Recharge électrique'] },
  { id: 'sante', name: 'Santé', icon: '💊', color: '#ef4444', type: 'expense', subs: ['Médecin', 'Pharmacie', 'Dentiste', 'Optique', 'Mutuelle'] },
  { id: 'assurances', name: 'Assurances', icon: '🛡️', color: '#8b5cf6', type: 'expense', subs: ['Habitation', 'Auto', 'Vie', 'Prévoyance'] },
  { id: 'enfants', name: 'Enfants', icon: '🧸', color: '#ec4899', type: 'expense', subs: ['Garde', 'École', 'Cantine', 'Activités', 'Vêtements'] },
  { id: 'loisirs', name: 'Loisirs', icon: '🎮', color: '#14b8a6', type: 'expense', subs: ['Sport', 'Cinéma', 'Sorties', 'Livres', 'Jeux'] },
  { id: 'restaurants', name: 'Restaurants', icon: '🍽️', color: '#f59e0b', type: 'expense', subs: ['Restaurant', 'Fast-food', 'Café', 'Livraison'] },
  { id: 'abonnements', name: 'Abonnements', icon: '📱', color: '#a855f7', type: 'expense', subs: ['Téléphone', 'Internet', 'Streaming', 'Musique', 'Presse', 'Logiciels'] },
  { id: 'vetements', name: 'Vêtements', icon: '👕', color: '#d946ef', type: 'expense', subs: ['Vêtements', 'Chaussures', 'Accessoires'] },
  { id: 'vacances', name: 'Vacances', icon: '✈️', color: '#06b6d4', type: 'expense', subs: ['Hébergement', 'Transport', 'Activités'] },
  { id: 'impots', name: 'Impôts', icon: '🏛️', color: '#78716c', type: 'expense', subs: ['Impôt sur le revenu', 'Taxe foncière', 'Taxe d\'habitation'] },
  { id: 'travaux', name: 'Travaux', icon: '🔨', color: '#b45309', type: 'expense', subs: ['Bricolage', 'Rénovation', 'Jardin', 'Mobilier'] },
  { id: 'achats', name: 'Achats', icon: '🛍️', color: '#e11d48', type: 'expense', subs: ['High-tech', 'Maison', 'Cadeaux', 'Divers'] },
  { id: 'epargne', name: 'Épargne', icon: '🐖', color: '#10b981', type: 'expense', subs: ['Livret A', 'Assurance vie', 'PEA', 'Autre'] },
  { id: 'autres', name: 'Autres', icon: '📦', color: '#94a3b8', type: 'expense', subs: [] },
  // Catégories de revenus
  { id: 'salaire', name: 'Salaire', icon: '💼', color: '#16a34a', type: 'income', subs: ['Salaire net', 'Prime', 'Heures sup.'] },
  { id: 'aides', name: 'Aides & allocations', icon: '🤝', color: '#0891b2', type: 'income', subs: ['CAF', 'Pôle emploi', 'APL'] },
  { id: 'remboursements', name: 'Remboursements', icon: '↩️', color: '#7c3aed', type: 'income', subs: ['Sécurité sociale', 'Mutuelle', 'Ami', 'Avoir'] },
  { id: 'investissements', name: 'Investissements', icon: '📈', color: '#ca8a04', type: 'income', subs: ['Dividendes', 'Intérêts', 'Plus-value'] },
  { id: 'ventes', name: 'Ventes', icon: '🏷️', color: '#f43f5e', type: 'income', subs: ['Occasion', 'Leboncoin', 'Vinted'] },
  { id: 'autres-revenus', name: 'Autres revenus', icon: '💶', color: '#84cc16', type: 'income', subs: ['Cadeau', 'Divers'] },
];

export const DEFAULT_ACCOUNTS = [
  { id: 'courant', name: 'Compte courant', icon: '🏦', color: '#2563eb', initialBalance: 0 },
  { id: 'epargne', name: 'Livret épargne', icon: '🐖', color: '#10b981', initialBalance: 0 },
  { id: 'especes', name: 'Espèces', icon: '💵', color: '#f59e0b', initialBalance: 0 },
];

export const DEFAULT_PAYMENT_METHODS = [
  { id: 'cb', name: 'Carte bancaire', icon: '💳' },
  { id: 'especes', name: 'Espèces', icon: '💵' },
  { id: 'virement', name: 'Virement', icon: '🔁' },
  { id: 'prelevement', name: 'Prélèvement', icon: '📤' },
  { id: 'cheque', name: 'Chèque', icon: '🧾' },
  { id: 'mobile', name: 'Paiement mobile', icon: '📲' },
];

export const FREQUENCIES = [
  { id: 'weekly', name: 'Hebdomadaire' },
  { id: 'monthly', name: 'Mensuel' },
  { id: 'yearly', name: 'Annuel' },
  { id: 'custom', name: 'Personnalisé (tous les N jours)' },
];

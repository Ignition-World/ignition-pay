'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type SupportedLocale = 'en' | 'es' | 'fr'

export interface TranslationDictionary {
  [key: string]: string | TranslationDictionary
}

const translations: Record<SupportedLocale, TranslationDictionary> = {
  en: {
    common: {
      dashboard: 'Dashboard',
      receive: 'Receive',
      send: 'Send',
      history: 'History',
      anchors: 'Anchors',
      settings: 'Settings',
      show: 'Show',
      hide: 'Hide',
      back: '← Back',
      copied: 'Copied!',
      copy: 'Copy',
      enabled: 'Enabled',
      active: 'Active',
      pending: 'Pending',
      processing: 'Processing',
      completed: 'Completed',
      failed: 'Failed',
      refunded: 'Refunded',
      confirmed: 'Confirmed',
    },
    dashboard: {
      title: 'Dashboard',
      welcome: "Welcome back! Here's your wallet overview.",
      loadingBalances: 'Loading wallet balances',
      assets: 'Assets',
      assetsSubtitle: 'Your Stellar assets and balances',
      noAssetsTitle: 'No assets yet',
      noAssetsDesc: 'Fund this wallet or receive a payment to see balances here.',
      receiveFunds: 'Receive funds',
      recentTransactions: 'Recent Transactions',
      recentTxSubtitle: 'Your latest activity on the Stellar network',
      viewAll: 'View All',
      noTxTitle: 'No transactions yet',
      noTxDesc: 'Payments you send or receive will appear here.',
      totalTransactions: 'Total Transactions',
      allTimeStellar: 'All time on Stellar',
      networkFeeSaved: 'Network Fee Saved',
      vsTraditional: 'vs traditional payment',
      accountAge: 'Account Age',
      activeMember: 'Active Stellar member',
      days: 'days',
    },
    walletCard: {
      nativeAsset: 'Native asset',
      balance: 'Balance',
      value: 'Value',
      valueOver7d: '{{code}} value over the last 7 days',
    },
    transactionRow: {
      sent: 'Sent',
      received: 'Received',
      details: 'Transaction Details',
      detailsDesc: 'Additional information about this transfer',
      status: 'Status',
      amount: 'Amount',
      dateTime: 'Date & Time',
      networkFee: 'Network Fee',
      to: 'To',
      from: 'From',
      hash: 'Transaction Hash',
      viewOnExplorer: 'View on Stellar Expert',
      pendingConfirmation: 'Transaction pending confirmation',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Manage your wallet and account preferences',
      account: 'Account',
      displayName: 'Display Name',
      avatarUrl: 'Avatar URL',
      publicAddress: 'Public Address',
      accountCreated: 'Account Created',
      appVersion: 'App Version',
      security: 'Security',
      password: 'Password',
      biometrics: 'Biometric Authentication',
      twoFactor: 'Two-Factor Auth',
      recoverySeed: 'Recovery Seed Phrase',
      recoverySeedWarning: "Keep this safe! You'll need it if you lose access to your device.",
      showPhrase: 'Show Recovery Phrase',
      hidePhrase: 'Hide Recovery Phrase',
      copyPhrase: 'Copy Phrase',
      activeSessions: 'Active Sessions',
      current: 'Current',
      notifications: 'Notifications',
      privacy: 'Privacy',
      analyticsTitle: 'Analytics & Usage Data',
      analyticsDesc: 'Help improve Ignition Pay by sharing anonymous usage data. No personal or financial information is collected.',
      preferences: 'Preferences',
      currency: 'Currency',
      theme: 'Theme',
      language: 'Language',
      dangerZone: 'Danger Zone',
      signOut: 'Sign Out',
      clearLocalData: 'Clear Local Data',
    },
  },
  es: {
    common: {
      dashboard: 'Panel Principal',
      receive: 'Recibir',
      send: 'Enviar',
      history: 'Historial',
      anchors: 'Anclas',
      settings: 'Ajustes',
      show: 'Mostrar',
      hide: 'Ocultar',
      back: '← Volver',
      copied: '¡Copiado!',
      copy: 'Copiar',
      enabled: 'Habilitado',
      active: 'Activo',
      pending: 'Pendiente',
      processing: 'Procesando',
      completed: 'Completado',
      failed: 'Fallido',
      refunded: 'Reembolsado',
      confirmed: 'Confirmado',
    },
    dashboard: {
      title: 'Panel Principal',
      welcome: '¡Bienvenido de nuevo! Aquí tienes el resumen de tu billetera.',
      loadingBalances: 'Cargando saldos de billetera',
      assets: 'Activos',
      assetsSubtitle: 'Tus activos y saldos en Stellar',
      noAssetsTitle: 'Sin activos aún',
      noAssetsDesc: 'Financia esta billetera o recibe un pago para ver tus saldos aquí.',
      receiveFunds: 'Recibir fondos',
      recentTransactions: 'Transacciones Recientes',
      recentTxSubtitle: 'Tu última actividad en la red Stellar',
      viewAll: 'Ver Todo',
      noTxTitle: 'Sin transacciones aún',
      noTxDesc: 'Los pagos que envíes o recibas aparecerán aquí.',
      totalTransactions: 'Transacciones Totales',
      allTimeStellar: 'Todo el tiempo en Stellar',
      networkFeeSaved: 'Tarifas Ahorradas',
      vsTraditional: 'vs pagos tradicionales',
      accountAge: 'Antigüedad de Cuenta',
      activeMember: 'Miembro activo de Stellar',
      days: 'días',
    },
    walletCard: {
      nativeAsset: 'Activo nativo',
      balance: 'Saldo',
      value: 'Valor',
      valueOver7d: 'Valor de {{code}} en los últimos 7 días',
    },
    transactionRow: {
      sent: 'Enviado',
      received: 'Recibido',
      details: 'Detalles de la Transacción',
      detailsDesc: 'Información adicional sobre esta transferencia',
      status: 'Estado',
      amount: 'Monto',
      dateTime: 'Fecha y Hora',
      networkFee: 'Comisión de Red',
      to: 'Para',
      from: 'De',
      hash: 'Hash de Transacción',
      viewOnExplorer: 'Ver en Stellar Expert',
      pendingConfirmation: 'Transacción pendiente de confirmación',
    },
    settings: {
      title: 'Ajustes',
      subtitle: 'Gestiona las preferencias de tu billetera y cuenta',
      account: 'Cuenta',
      displayName: 'Nombre visible',
      avatarUrl: 'URL del Avatar',
      publicAddress: 'Dirección Pública',
      accountCreated: 'Cuenta Creada',
      appVersion: 'Versión de la App',
      security: 'Seguridad',
      password: 'Contraseña',
      biometrics: 'Autenticación Biométrica',
      twoFactor: 'Autenticación de Dos Factores',
      recoverySeed: 'Frase Semilla de Recuperación',
      recoverySeedWarning: '¡Mantén esto seguro! Lo necesitarás si pierdes el acceso a tu dispositivo.',
      showPhrase: 'Mostrar Frase de Recuperación',
      hidePhrase: 'Ocultar Frase de Recuperación',
      copyPhrase: 'Copiar Frase',
      activeSessions: 'Sesiones Activas',
      current: 'Actual',
      notifications: 'Notificaciones',
      privacy: 'Privacidad',
      analyticsTitle: 'Analítica y Datos de Uso',
      analyticsDesc: 'Ayuda a mejorar Ignition Pay compartiendo datos de uso anónimos. No se recopila información personal ni financiera.',
      preferences: 'Preferencias',
      currency: 'Moneda',
      theme: 'Tema',
      language: 'Idioma',
      dangerZone: 'Zona de Peligro',
      signOut: 'Cerrar Sesión',
      clearLocalData: 'Borrar Datos Locales',
    },
  },
  fr: {
    common: {
      dashboard: 'Tableau de bord',
      receive: 'Recevoir',
      send: 'Envoyer',
      history: 'Historique',
      anchors: 'Ancres',
      settings: 'Paramètres',
      show: 'Afficher',
      hide: 'Masquer',
      back: '← Retour',
      copied: 'Copié !',
      copy: 'Copier',
      enabled: 'Activé',
      active: 'Actif',
      pending: 'En attente',
      processing: 'Traitement',
      completed: 'Terminé',
      failed: 'Échoué',
      refunded: 'Remboursé',
      confirmed: 'Confirmé',
    },
    dashboard: {
      title: 'Tableau de bord',
      welcome: 'Bon retour ! Voici un aperçu de votre portefeuille.',
      loadingBalances: 'Chargement des soldes du portefeuille',
      assets: 'Actifs',
      assetsSubtitle: 'Vos actifs et soldes Stellar',
      noAssetsTitle: 'Aucun actif pour le moment',
      noAssetsDesc: 'Approvisionnez ce portefeuille ou recevez un paiement pour voir les soldes ici.',
      receiveFunds: 'Recevoir des fonds',
      recentTransactions: 'Transactions récentes',
      recentTxSubtitle: 'Votre dernière activité sur le réseau Stellar',
      viewAll: 'Voir tout',
      noTxTitle: 'Aucune transaction',
      noTxDesc: 'Les paiements que vous envoyez ou recevez apparaîtront ici.',
      totalTransactions: 'Transactions totales',
      allTimeStellar: 'Depuis le début sur Stellar',
      networkFeeSaved: 'Frais de réseau économisés',
      vsTraditional: 'par rapport aux paiements traditionnels',
      accountAge: 'Âge du compte',
      activeMember: 'Membre actif de Stellar',
      days: 'jours',
    },
    walletCard: {
      nativeAsset: 'Actif natif',
      balance: 'Solde',
      value: 'Valeur',
      valueOver7d: 'Valeur de {{code}} au cours des 7 derniers jours',
    },
    transactionRow: {
      sent: 'Envoyé',
      received: 'Reçu',
      details: 'Détails de la transaction',
      detailsDesc: 'Informations supplémentaires sur ce transfert',
      status: 'Statut',
      amount: 'Montant',
      dateTime: 'Date & Heure',
      networkFee: 'Frais de réseau',
      to: 'À',
      from: 'De',
      hash: 'Hachage de la transaction',
      viewOnExplorer: 'Voir sur Stellar Expert',
      pendingConfirmation: 'Transaction en attente de confirmation',
    },
    settings: {
      title: 'Paramètres',
      subtitle: 'Gérez votre portefeuille et vos préférences de compte',
      account: 'Compte',
      displayName: "Nom d'affichage",
      avatarUrl: "URL de l'avatar",
      publicAddress: 'Adresse publique',
      accountCreated: 'Compte créé',
      appVersion: "Version de l'application",
      security: 'Sécurité',
      password: 'Mot de passe',
      biometrics: 'Authentification biométrique',
      twoFactor: 'Authentification à deux facteurs',
      recoverySeed: 'Phrase de récupération',
      recoverySeedWarning: 'Gardez ceci en sécurité ! Vous en aurez besoin si vous perdez l\'accès à votre appareil.',
      showPhrase: 'Afficher la phrase de récupération',
      hidePhrase: 'Masquer la phrase de récupération',
      copyPhrase: 'Copier la phrase',
      activeSessions: 'Sessions actives',
      current: 'Actuel',
      notifications: 'Notifications',
      privacy: 'Confidentialité',
      analyticsTitle: 'Analytique & Données d\'utilisation',
      analyticsDesc: 'Aidez à améliorer Ignition Pay en partageant des données d\'utilisation anonymes. Aucune donnée personnelle ou financière n\'est collectée.',
      preferences: 'Préférences',
      currency: 'Devise',
      theme: 'Thème',
      language: 'Langue',
      dangerZone: 'Zone dangereuse',
      signOut: 'Se déconnecter',
      clearLocalData: 'Effacer les données locales',
    },
  },
}

interface LanguageContextType {
  locale: SupportedLocale
  setLocale: (locale: SupportedLocale) => void
  t: (path: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (path) => path,
})

const LOCALE_STORAGE_KEY = 'ignition_pay_locale'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('en')

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as SupportedLocale | null
    if (saved && (saved === 'en' || saved === 'es' || saved === 'fr')) {
      setLocaleState(saved)
    }
  }, [])

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale)
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
  }, [])

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>): string => {
      const keys = path.split('.')
      let current: any = translations[locale] || translations.en

      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key]
        } else {
          // Fallback to English if translation key missing in current locale
          let fallback: any = translations.en
          for (const fk of keys) {
            if (fallback && typeof fallback === 'object' && fk in fallback) {
              fallback = fallback[fk]
            } else {
              return path
            }
          }
          current = fallback
          break
        }
      }

      if (typeof current !== 'string') return path

      let result = current
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          result = result.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
        })
      }

      return result
    },
    [locale],
  )

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  return useContext(LanguageContext)
}

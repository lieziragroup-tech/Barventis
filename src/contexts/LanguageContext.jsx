import React, { createContext, useContext, useState, useCallback } from 'react';

const LanguageContext = createContext();

export const useLang = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('barventis_lang') || 'id'; } catch { return 'id'; }
  });

  const setLang = useCallback((newLang) => {
    setLangState(newLang);
    try { localStorage.setItem('barventis_lang', newLang); } catch {}
  }, []);

  const t = useCallback((copyObj) => copyObj?.[lang] || copyObj?.id || '', [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

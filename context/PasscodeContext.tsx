import React, { createContext, useContext, useState, ReactNode } from "react";

interface PasscodeContextType {
  isPasscodeEnabled: boolean;
  passcode: string | null;
  setPasscode: (code: string | null) => void;
  setIsPasscodeEnabled: (enabled: boolean) => void;
  isUnlocked: boolean;
  setIsUnlocked: (unlocked: boolean) => void;
}

const PasscodeContext = createContext<PasscodeContextType | undefined>(undefined);

export function PasscodeProvider({ children }: { children: ReactNode }) {
  const [isPasscodeEnabled, setIsPasscodeEnabled] = useState(false);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  return (
    <PasscodeContext.Provider value={{ isPasscodeEnabled, passcode, setPasscode, setIsPasscodeEnabled, isUnlocked, setIsUnlocked }}>
      {children}
    </PasscodeContext.Provider>
  );
}

export function usePasscode() {
  const context = useContext(PasscodeContext);
  if (!context) {
    throw new Error("usePasscode must be used within a PasscodeProvider");
  }
  return context;
}

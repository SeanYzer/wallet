import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_URL, getSetting } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";
import { useRepositories } from "./RepositoryContext";

interface UserProfile {
    name: string;
    isFirstRun: boolean;
    initialBalance: number;
    isDarkMode: boolean;
    language: string;
    currency: string;
    decimalPoints: number;
    autoBackup: boolean;
}

const DEFAULT_PROFILE: UserProfile = {
    name: "",
    isFirstRun: true,
    initialBalance: 0,
    isDarkMode: false,
    language: "en",
    currency: "PHP",
    decimalPoints: 2,
    autoBackup: true
};

interface UserProfileContextType {
    profile: UserProfile | null;
    isLoading: boolean;
    completeSetup: (name: string, balance: number) => Promise<void>;
    updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
    resetProfileToDefaults: () => Promise<void>;
    refetch: () => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export function UserProfileProvider({ children }: { children: ReactNode }) {
    const { activeUserId } = useAuth();
    const repos = useRepositories();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!activeUserId) {
            setIsLoading(false);
            setProfile(null);
            return;
        }
        fetchProfile();
    }, [activeUserId]);

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const local = await repos.profiles.getById('default');

              if (API_URL && activeUserId) {
                  const { ok, data: cloudProfile } = await authFetch(`userProfiles?userId=${activeUserId}`);

                  if (ok && cloudProfile && cloudProfile.name) {
                     const merged = { ...DEFAULT_PROFILE, ...cloudProfile };
                     setProfile(merged);
                     await repos.profiles.upsert(merged as UserProfile);
                     return;
                 }
             }

            if (local) {
                setProfile({ ...DEFAULT_PROFILE, ...local });
            } else {
                setProfile(DEFAULT_PROFILE);
            }
        } catch (e) {
            console.error("Error fetching profile:", e);
            setProfile(DEFAULT_PROFILE);
        } finally {
            setIsLoading(false);
        }
    };

    const updateProfile = async (updates: Partial<UserProfile>) => {
        if (!profile) return;
        const newProfile = { ...profile, ...updates };

        await repos.profiles.upsert(newProfile as UserProfile);
        setProfile(newProfile);

        if (API_URL && activeUserId && newProfile.autoBackup) {
            try {
                await authFetch(`userProfiles/${activeUserId}`, {
                    method: "PUT",
                    body: JSON.stringify(newProfile)
                });
            } catch (e) {
                console.error("Cloud profile sync error:", e);
            }
        }
    };

    const resetProfileToDefaults = async () => {
        if (!profile) return;
        await updateProfile({
            ...DEFAULT_PROFILE,
            name: profile.name,
            isFirstRun: false
        });
    };

    const completeSetup = async (name: string, balance: number) => {
        try {
            await updateProfile({
                name,
                initialBalance: balance,
                isFirstRun: false
            });
        } catch (error) {
            console.error("Error completing setup:", error);
            throw error;
        }
    };

    return (
        <UserProfileContext.Provider value={{ profile, isLoading, completeSetup, updateProfile, resetProfileToDefaults, refetch: fetchProfile }}>
            {children}
        </UserProfileContext.Provider>
    );
}

export function useUserProfile() {
    const context = useContext(UserProfileContext);
    if (!context) {
        throw new Error("useUserProfile must be used within a UserProfileProvider");
    }
    return context;
}

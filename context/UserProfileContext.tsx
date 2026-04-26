import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getUserProfile, saveUserProfile, getSetting, API_URL } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";

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
    const { activeUserId, logout } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!activeUserId) return;
        fetchProfile();
    }, [activeUserId]);

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const local = await getUserProfile();
            
            if (API_URL && activeUserId) {
                const response = await authFetch(`userProfiles?userId=${activeUserId}`);
                
                if (response.status === 401) {
                    console.warn("User no longer exists or token expired. Forcing logout.");
                    await logout();
                    return;
                }

                if (response.ok) {
                    const cloudProfile = await response.json();
                    if (cloudProfile && cloudProfile.name) {
                        const merged = { ...DEFAULT_PROFILE, ...cloudProfile };
                        setProfile(merged);
                        await saveUserProfile(merged);
                        return;
                    }
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
        
        await saveUserProfile(newProfile);
        setProfile(newProfile);

        // Only sync to cloud if autoBackup is enabled (as per integration.md)
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
            await updateProfile({ name, balance, isFirstRun: false });
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

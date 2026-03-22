import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getUserProfile, saveUserProfile, getSetting } from "../utils/db";
import { useAuth } from "./AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

interface UserProfile {
    isFirstRun: boolean;
    name: string;
    initialBalance: number;
}

    interface UserProfileContextType {
    profile: UserProfile | null;
    isLoading: boolean;
    completeSetup: (name: string) => Promise<void>;
    refetch: () => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export function UserProfileProvider({ children }: { children: ReactNode }) {
    const { activeUserId } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!activeUserId) return;
        fetchProfile();
    }, [activeUserId]);

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            // Local check first
            const local = await getUserProfile();
            if (local) {
                setProfile(local);
                return;
            }

            // API check segmented by userId
            const response = await fetch(`${API_URL}/userProfiles?userId=${activeUserId}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    const cloudProfile = data[0];
                    setProfile({
                        name: cloudProfile.name,
                        isFirstRun: cloudProfile.isFirstRun,
                        initialBalance: cloudProfile.initialBalance,
                    });
                    await saveUserProfile(cloudProfile.name, cloudProfile.isFirstRun, cloudProfile.initialBalance);
                } else {
                    // No cloud profile, set default for first run
                    setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
                }
            } else {
                // API error, fallback to default
                console.error("Error fetching profile from API:", response.status);
                setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
            }
        } catch (e) {
            console.error("Error fetching profile:", e);
            // Fallback for offline/error
            setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
        } finally {
            setIsLoading(false);
        }
    };

    const updateProfile = async (name: string, isFirstRun: boolean, initialBalance: number) => {
        await saveUserProfile(name, isFirstRun, initialBalance);
        setProfile({ name, isFirstRun, initialBalance });

        if (activeUserId) {
            // Sync to cloud - segmented by userId
            try {
                // Check if profile exists first for this user
                const check = await fetch(`${API_URL}/userProfiles?userId=${activeUserId}`);
                const existing = await check.json();

                const method = (existing && existing.length > 0) ? "PATCH" : "POST";
                const url = (existing && existing.length > 0)
                    ? `${API_URL}/userProfiles/${existing[0].id}`
                    : `${API_URL}/userProfiles`;

                const response = await fetch(url, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, isFirstRun, initialBalance, userId: activeUserId })
                });

                if (!response.ok) {
                    console.warn("Cloud profile sync failed with status:", response.status);
                }
            } catch (e) {
                console.error("Cloud profile sync error:", e);
            }
        }
    };

    const completeSetup = async (name: string) => {
        try {
            await updateProfile(name, false, 0);
        } catch (error) {
            console.error("Error completing setup:", error);
            throw error;
        }
    };

    return (
        <UserProfileContext.Provider value={{ profile, isLoading, completeSetup, refetch: fetchProfile }}>
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

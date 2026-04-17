import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getUserProfile, saveUserProfile, getSetting, USE_API } from "../utils/db";
import { authFetch } from "../utils/apiClient";
import { useAuth } from "./AuthContext";

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

            if (USE_API && activeUserId) {
                const response = await authFetch(`userProfiles?userId=${activeUserId}`);
                if (response.ok) {
                    const cloudProfile = await response.json();
                    if (cloudProfile && cloudProfile.name) {
                        setProfile({
                            name: cloudProfile.name,
                            isFirstRun: false,
                            initialBalance: cloudProfile.initialBalance || 0,
                        });
                        await saveUserProfile(cloudProfile.name, false, cloudProfile.initialBalance || 0);
                        return;
                    }
                }
                setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
            } else {
                setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
            }
        } catch (e) {
            console.error("Error fetching profile:", e);
            setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
        } finally {
            setIsLoading(false);
        }
    };

    const updateProfile = async (name: string, isFirstRun: boolean, initialBalance: number) => {
        await saveUserProfile(name, isFirstRun, initialBalance);
        setProfile({ name, isFirstRun, initialBalance });

        if (USE_API && activeUserId) {
            try {
                const response = await authFetch(`userProfiles/${activeUserId}`, {
                    method: "PUT",
                    body: JSON.stringify({ name, isFirstRun, initialBalance })
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

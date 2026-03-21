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
            const data = await getUserProfile();
            if (data) {
                setProfile(data);
            } else {
                setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
            // Fallback for offline/error
            setProfile({ isFirstRun: true, name: "", initialBalance: 0 });
        } finally {
            setIsLoading(false);
        }
    };

    const completeSetup = async (name: string) => {
        try {
            await saveUserProfile(name, false, 0);
            const updated = { isFirstRun: false, name, initialBalance: 0 };
            setProfile(updated);
            
            const autoBackup = await getSetting('autoBackup');
            if (autoBackup === 'true') {
                fetch(`${API_URL}/userProfile`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...updated, userId: activeUserId }),
                }).then(res => {
                    if (!res.ok) console.warn("Sync failed with status:", res.status);
                }).catch(err => console.error("Sync error:", err));
            }
        } catch (error) {
            console.error("Error saving user profile:", error);
            throw error;
        }
    };

    return (
        <UserProfileContext.Provider value={{ profile, isLoading, completeSetup }}>
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

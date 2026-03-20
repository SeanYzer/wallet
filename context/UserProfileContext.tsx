import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

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
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_URL}/userProfile`);
            if (response.ok) {
                const data: UserProfile = await response.json();
                setProfile(data);
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
            // Fallback for offline/error
            setProfile({ isFirstRun: false, name: "", initialBalance: 0 });
        } finally {
            setIsLoading(false);
        }
    };

    const completeSetup = async (name: string) => {
        try {
            const response = await fetch(`${API_URL}/userProfile`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isFirstRun: false, name, initialBalance: 0 }),
            });
            if (!response.ok) {
                throw new Error("Failed to save profile");
            }
            const updated: UserProfile = await response.json();
            setProfile(updated);
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

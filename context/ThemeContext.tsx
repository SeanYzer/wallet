import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
    MD3LightTheme,
    MD3DarkTheme,
    adaptNavigationTheme,
    MD3Theme
} from "react-native-paper";
import {
    DefaultTheme as NavigationDefaultTheme,
    DarkTheme as NavigationDarkTheme,
    Theme as NavigationTheme
} from "@react-navigation/native";
import merge from "deepmerge";

const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: NavigationDefaultTheme,
    reactNavigationDark: NavigationDarkTheme,
});

const CustomLightTheme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: '#1B3F7A',
        onPrimary: '#FFFFFF',
        primaryContainer: '#D6E4FF',
        secondary: '#2D9CDB',
        onSecondary: '#FFFFFF',
        tertiary: '#27AE60',
        error: '#E53935',
        background: '#F4F6FA',
        surface: '#FFFFFF',
        onBackground: '#1A1A2E',
        onSurface: '#1A1A2E',
        surfaceVariant: '#E8EDF5',
        outline: '#B0BEC5',
    },
};

const CustomDarkTheme = {
    ...MD3DarkTheme,
    colors: {
        ...MD3DarkTheme.colors,
        primary: '#4A90D9',
        onPrimary: '#001F4D',
        primaryContainer: '#003580',
        secondary: '#56CCF2',
        background: '#0D1117',
        surface: '#161B22',
        onBackground: '#E6EDF3',
        onSurface: '#E6EDF3',
    },
};

const CombinedDefaultTheme = {
    ...merge(LightTheme, CustomLightTheme),
    roundness: 3, // More modern, rounded feel
};
const CombinedDarkTheme = {
    ...merge(DarkTheme, CustomDarkTheme),
    roundness: 3,
};

interface ThemeContextType {
    isDarkMode: boolean;
    toggleTheme: () => void;
    theme: MD3Theme & NavigationTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemColorScheme = useColorScheme();
    const [isDarkMode, setIsDarkMode] = useState(false);

    const toggleTheme = () => {
        setIsDarkMode((prev) => !prev);
    };

    const theme = isDarkMode ? CombinedDarkTheme : CombinedDefaultTheme;

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useAppTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useAppTheme must be used within a ThemeProvider");
    }
    return context;
}

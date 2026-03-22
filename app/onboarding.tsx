import { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { Text, TextInput, Button, HelperText } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useUserProfile } from "../context/UserProfileContext";

export default function OnboardingScreen() {
    const router = useRouter();
    const { completeSetup } = useUserProfile();

    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<{ name?: string }>({});

    const validate = () => {
        const newErrors: { name?: string } = {};
        if (!name.trim()) {
            newErrors.name = "Please enter your name.";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleGetStarted = async () => {
        if (!validate()) return;
        setLoading(true);
        try {
            await completeSetup(name.trim());
            router.replace("/");
        } catch (e) {
            console.error("Setup failed:", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient colors={["#1a237e", "#283593", "#3949ab"]} style={styles.gradient}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                    {/* Logo & Welcome */}
                    <View style={styles.header}>
                        <Text style={styles.walletEmoji}>💰</Text>
                        <Text style={styles.appName}>WiseWallet</Text>
                        <Text style={styles.tagline}>Your personal finance companion</Text>
                    </View>

                    {/* Card */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Welcome! Let's get you set up.</Text>
                        <Text style={styles.cardSubtitle}>
                            Tell us a bit about yourself so we can personalize your experience.
                        </Text>

                        {/* Name Field */}
                        <TextInput
                            label="Your Name"
                            value={name}
                            onChangeText={setName}
                            mode="outlined"
                            style={styles.input}
                            left={<TextInput.Icon icon="account" />}
                            error={!!errors.name}
                            autoCapitalize="words"
                            returnKeyType="next"
                        />
                        <HelperText type="error" visible={!!errors.name}>
                            {errors.name}
                        </HelperText>

                        {/* CTA Button */}
                        <Button
                            mode="contained"
                            onPress={handleGetStarted}
                            loading={loading}
                            disabled={loading}
                            style={styles.button}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.buttonLabel}
                            icon="rocket-launch"
                        >
                            Get Started
                        </Button>
                    </View>

                    <Text style={styles.footerText}>
                        You can always update your balance later by adding a transaction.
                    </Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: { flex: 1 },
    flex: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        justifyContent: "center",
        padding: 24,
    },
    header: {
        alignItems: "center",
        marginBottom: 32,
    },
    walletEmoji: {
        fontSize: 64,
        marginBottom: 8,
    },
    appName: {
        fontSize: 36,
        fontWeight: "bold",
        color: "#fff",
        letterSpacing: 1.5,
    },
    tagline: {
        fontSize: 14,
        color: "rgba(255,255,255,0.7)",
        marginTop: 4,
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 24,
        padding: 24,
        elevation: 8,
        ...Platform.select({
            web: { boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.3)" },
            default: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            }
        })
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#1a237e",
        marginBottom: 6,
    },
    cardSubtitle: {
        fontSize: 14,
        color: "#666",
        marginBottom: 20,
        lineHeight: 20,
    },
    input: {
        marginBottom: 4,
        backgroundColor: "#fff",
    },
    button: {
        marginTop: 16,
        borderRadius: 12,
        backgroundColor: "#3949ab",
    },
    buttonContent: {
        paddingVertical: 6,
    },
    buttonLabel: {
        fontSize: 16,
        fontWeight: "bold",
        letterSpacing: 0.5,
    },
    footerText: {
        textAlign: "center",
        color: "rgba(255,255,255,0.5)",
        fontSize: 12,
        marginTop: 24,
    },
});

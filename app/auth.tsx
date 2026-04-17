import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, useTheme as usePaperTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function AuthScreen() {
    const router = useRouter();
    const { login } = useAuth();
    
    // UI state
    const [name, setName] = useState("");
    const [passcode, setPasscode] = useState("");
    const [loading, setLoading] = useState(false);

    const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

    const handleRegister = async () => {
        if (!name.trim() || !passcode.trim()) {
            Alert.alert("Error", "Username and PIN are required");
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), passcode: passcode.trim(), initialBalance: 0 }),
            });
            
            const responseData = await response.json();

            if (!response.ok) {
                Alert.alert("Error", responseData.message || "Could not register account");
                setLoading(false);
                return;
            }

            await login(responseData.data.user.id, responseData.data.token);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not register account");
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async () => {
        if (!name.trim() || !passcode.trim()) {
            Alert.alert("Error", "Username and PIN are required");
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), passcode: passcode.trim() }),
            });
            
            const responseData = await response.json();

            if (!response.ok) {
                Alert.alert("Error", responseData.message || "Invalid credentials");
                setLoading(false);
                return;
            }

            await login(responseData.data.user.id, responseData.data.token);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Cloud login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient colors={["#1a237e", "#283593", "#3949ab"]} style={styles.gradient}>
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"} 
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <View style={styles.container}>
                        <Text style={styles.appName}>WiseWallet</Text>
                        <Text style={styles.tagline}>Welcome Back</Text>

                        <Card style={styles.card}>
                            <Card.Content>
                                <TextInput
                                    label="Username"
                                    value={name}
                                    onChangeText={setName}
                                    style={styles.input}
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                    autoCapitalize="none"
                                />
                                <TextInput
                                    label="PIN (4-digits)"
                                    value={passcode}
                                    onChangeText={setPasscode}
                                    keyboardType="numeric"
                                    secureTextEntry
                                    style={styles.input}
                                    mode="outlined"
                                    outlineColor="#e0e0e0"
                                    activeOutlineColor="#3949ab"
                                />
                                
                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                    <Button 
                                        mode="contained" 
                                        onPress={handleLogin} 
                                        loading={loading}
                                        disabled={loading}
                                        style={[styles.createBtn, { flex: 1, marginTop: 0 }]}
                                    >
                                        Login
                                    </Button>
                                    <Button 
                                        mode="outlined" 
                                        onPress={handleRegister} 
                                        loading={loading}
                                        disabled={loading}
                                        style={[styles.createBtn, { flex: 1, marginTop: 0, backgroundColor: 'transparent', borderColor: '#3949ab' }]}
                                        textColor="#3949ab"
                                    >
                                        Register
                                    </Button>
                                </View>
                            </Card.Content>
                        </Card>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center' },
    container: { padding: 24 },
    appName: { fontSize: 36, fontWeight: "bold", color: "#fff", textAlign: 'center', marginBottom: 8 },
    tagline: { fontSize: 16, color: "rgba(255,255,255,0.7)", textAlign: 'center', marginBottom: 32 },
    card: { 
        backgroundColor: '#fff', 
        borderRadius: 24, 
        padding: 8, 
        elevation: 8, 
        ...Platform.select({
            web: { boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)' },
            default: {
                shadowColor: '#000', 
                shadowOffset: { width: 0, height: 4 }, 
                shadowOpacity: 0.2, 
                shadowRadius: 8 
            }
        })
    },
    createBtn: { marginTop: 20, marginBottom: 8, borderRadius: 12, paddingVertical: 4, backgroundColor: '#3949ab' },
    input: { marginBottom: 12, backgroundColor: '#fff' }
});

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, Avatar, List, Dialog, Portal, useTheme as usePaperTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { getUsers, addUser, initDb, saveUserProfile, getUserProfile } from '../utils/db';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function AuthScreen() {
    const router = useRouter();
    const { login } = useAuth();
    const [users, setUsers] = useState<{id: string, name: string, passcode: string}[]>([]);
    
    // UI state
    const [name, setName] = useState("");
    const [passcode, setPasscode] = useState("");
    const [loading, setLoading] = useState(false);
    const [showAccounts, setShowAccounts] = useState(true);

    const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const list = await getUsers();
            setUsers(list);
            if (list.length === 0) setShowAccounts(false);
        } catch(e) {
            console.error("Error loading users:", e);
        }
    };

    const handleRegister = async () => {
        if (!name.trim() || !passcode.trim()) {
            Alert.alert("Error", "Username and PIN are required");
            return;
        }
        setLoading(true);
        try {
            // 1. Check if user exists on API
            const response = await fetch(`${API_URL}/users?name=${name.trim()}`);
            const existingUsers = await response.json();
            
            if (existingUsers.length > 0) {
                Alert.alert("Error", "Username already exists on the cloud. Please login instead.");
                setLoading(false);
                return;
            }

            const newId = Date.now().toString();
            
            // 2. Save to local master.db
            await addUser(newId, name.trim(), passcode.trim());
            
            // 3. POST to API /users for cross-device visibility
            await fetch(`${API_URL}/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: newId, name: name.trim(), passcode: passcode.trim() }),
            });

            // 4. Build local tables
            await initDb(newId);
            await saveUserProfile(name.trim(), false, 0, newId);
            
            await login(newId);
            router.replace("/");
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
            const list = await getUsers();
            const localUser = list.find(u => u.name.toLowerCase() === name.trim().toLowerCase());

            if (localUser) {
                if (localUser.passcode === passcode.trim()) {
                    await login(localUser.id);
                    await initDb();
                    router.replace("/");
                    return;
                } else {
                    Alert.alert("Error", "Incorrect PIN");
                    setLoading(false);
                    return;
                }
            }

            // Not found locally, check Cloud
            const response = await fetch(`${API_URL}/users?name=${name.trim()}`);
            if (!response.ok) throw new Error("Cloud check failed");
            const cloudUsers = await response.json();

            if (cloudUsers.length > 0) {
                const cloudUser = cloudUsers[0];
                if (cloudUser.passcode === passcode.trim()) {
                    // Import Cloud account to local master.db
                    await addUser(cloudUser.id, cloudUser.name, cloudUser.passcode);
                    await initDb(cloudUser.id);
                    await saveUserProfile(cloudUser.name, false, 0, cloudUser.id);
                    
                    await login(cloudUser.id);
                    router.replace("/");
                    return;
                } else {
                    Alert.alert("Error", "Incorrect PIN for this cloud account");
                }
            } else {
                Alert.alert("Not Found", "Account not found locally or on the cloud. Please register.");
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Cloud login failed");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectLocal = (user: {id: string, name: string, passcode: string}) => {
        setName(user.name);
        setPasscode(""); // Force re-entry of PIN for security
        setShowAccounts(false);
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
                        <Text style={styles.tagline}>{showAccounts ? "Select Account" : "Welcome Back"}</Text>

                        {showAccounts ? (
                            <Card style={styles.card}>
                                <Card.Content>
                                    {users.map(user => (
                                        <List.Item
                                            key={user.id}
                                            title={user.name}
                                            titleStyle={{ color: '#333', fontWeight: '600' }}
                                            left={props => <Avatar.Text {...props} size={40} label={user.name.substring(0, 2).toUpperCase()} />}
                                            onPress={() => handleSelectLocal(user)}
                                            style={styles.listItem}
                                        />
                                    ))}
                                    <Button mode="contained" onPress={() => setShowAccounts(false)} style={styles.createBtn}>
                                        Use Different Account
                                    </Button>
                                </Card.Content>
                            </Card>
                        ) : (
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

                                    {users.length > 0 && (
                                        <Button mode="text" onPress={() => setShowAccounts(true)} style={{ marginTop: 8 }} textColor="#666">
                                            Switch to Local Accounts
                                        </Button>
                                    )}
                                </Card.Content>
                            </Card>
                        )}
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
    input: { marginBottom: 12, backgroundColor: '#fff' },
    listItem: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 8 }
});

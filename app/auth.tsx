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
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPasscode, setNewPasscode] = useState("");
    
    const [selectedUser, setSelectedUser] = useState<{id: string, name: string, passcode: string} | null>(null);
    const [loginPasscode, setLoginPasscode] = useState("");

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const list = await getUsers();
            setUsers(list);
        } catch(e) {
            console.error("Error loading users:", e);
        }
    };

    const handleCreateUser = async () => {
        if (!newName.trim() || !newPasscode.trim()) {
            Alert.alert("Error", "Name and passcode are required");
            return;
        }
        try {
            const newId = Date.now().toString();
            await addUser(newId, newName.trim(), newPasscode.trim());
            
            // 1. Build tables and seed the profile explicitly FIRST
            await initDb(newId);
            await saveUserProfile(newName.trim(), false, 0, newId);
            
            // 2. NOW update the global login state
            await login(newId);
            
            router.replace("/");
            setNewName("");
            setNewPasscode("");
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not create user");
        }
    };

    const handleLogin = async () => {
        if (!selectedUser) return;
        if (loginPasscode === selectedUser.passcode) {
            await login(selectedUser.id);
            await initDb();
            
            // Ensure local profile name matches account name (Asta)
            const localProfile = await getUserProfile();
            if (!localProfile || !localProfile.name || localProfile.name === "") {
                await saveUserProfile(selectedUser.name, false, 0);
            }

            router.replace("/");
            setSelectedUser(null);
            setLoginPasscode("");
        } else {
            Alert.alert("Error", "Incorrect Passcode");
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
                        <Text style={styles.tagline}>Select Account</Text>

                        {!isCreating ? (
                            <Card style={styles.card}>
                                <Card.Content>
                                    {users.length === 0 ? (
                                        <Text style={{textAlign: 'center', marginVertical: 20, color: '#666'}}>No existing accounts found.</Text>
                                    ) : (
                                        users.map(user => (
                                            <List.Item
                                                key={user.id}
                                                title={user.name}
                                                titleStyle={{ color: '#333', fontWeight: '600' }}
                                                description="Tap to login"
                                                descriptionStyle={{ color: '#666' }}
                                                left={props => <Avatar.Text {...props} size={40} label={user.name.substring(0, 2).toUpperCase()} />}
                                                onPress={() => setSelectedUser(user)}
                                                style={styles.listItem}
                                            />
                                        ))
                                    )}
                                    <Button mode="contained" onPress={() => setIsCreating(true)} style={styles.createBtn}>
                                        Create New Account
                                    </Button>
                                </Card.Content>
                            </Card>
                        ) : (
                            <Card style={styles.card}>
                                <Card.Content>
                                    <Text variant="titleMedium" style={{marginBottom: 16, color: '#1a237e', fontWeight: 'bold'}}>New Account</Text>
                                    <TextInput
                                        label="Name"
                                        value={newName}
                                        onChangeText={setNewName}
                                        style={styles.input}
                                        mode="outlined"
                                        outlineColor="#e0e0e0"
                                        activeOutlineColor="#3949ab"
                                    />
                                    <TextInput
                                        label="Passcode (PIN)"
                                        value={newPasscode}
                                        onChangeText={setNewPasscode}
                                        keyboardType="numeric"
                                        secureTextEntry
                                        style={styles.input}
                                        mode="outlined"
                                        outlineColor="#e0e0e0"
                                        activeOutlineColor="#3949ab"
                                    />
                                    <Button mode="contained" onPress={handleCreateUser} style={styles.createBtn}>
                                        Register
                                    </Button>
                                    <Button mode="text" onPress={() => setIsCreating(false)} textColor="#3949ab">
                                        Back to Accounts
                                    </Button>
                                </Card.Content>
                            </Card>
                        )}
                    </View>
                </ScrollView>

                <Portal>
                    <Dialog visible={!!selectedUser} onDismiss={() => setSelectedUser(null)} style={{ backgroundColor: '#fff' }}>
                        <Dialog.Title style={{ color: '#1a237e' }}>Login as {selectedUser?.name}</Dialog.Title>
                        <Dialog.Content>
                            <TextInput
                                label="Enter Passcode"
                                value={loginPasscode}
                                onChangeText={setLoginPasscode}
                                keyboardType="numeric"
                                secureTextEntry
                                mode="outlined"
                            />
                        </Dialog.Content>
                        <Dialog.Actions>
                            <Button onPress={() => setSelectedUser(null)} textColor="#666">Cancel</Button>
                            <Button onPress={handleLogin} textColor="#3949ab">Login</Button>
                        </Dialog.Actions>
                    </Dialog>
                </Portal>
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
    card: { backgroundColor: '#fff', borderRadius: 24, padding: 8, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
    createBtn: { marginTop: 20, marginBottom: 8, borderRadius: 12, paddingVertical: 4, backgroundColor: '#3949ab' },
    input: { marginBottom: 12, backgroundColor: '#fff' },
    listItem: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 8 }
});

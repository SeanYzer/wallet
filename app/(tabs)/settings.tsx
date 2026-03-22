import { useState, useEffect } from "react";
import { View, ScrollView, Alert, Platform } from "react-native";
import { Appbar, List, RadioButton, Text, Card, Switch, Divider, Button, Avatar, Portal, Dialog, TextInput, useTheme as usePaperTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { getSetting, setSetting, clearAllLocalData, getTransactions, getCategories, getUserProfile, exportData, importData, deleteUser } from "../../utils/db";
import { useAuth } from "../../context/AuthContext";
import { useCurrency, CURRENCIES, CurrencyCode } from "../../context/CurrencyContext";
import { useAppTheme } from "../../context/ThemeContext";
import { useUserProfile } from "../../context/UserProfileContext";
import { useLanguage } from "../../context/LanguageContext";
import { usePasscode } from "../../context/PasscodeContext";
import { useTransactionsContext } from "../../context/TransactionsContext";
import { useCategories } from "../../context/CategoriesContext";

export default function SettingsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { currency, setCurrency, decimalPlaces, setDecimalPlaces } = useCurrency();
  const { theme, isDarkMode, toggleTheme } = useAppTheme();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const { language, setLanguage, t } = useLanguage();
  const { isPasscodeEnabled, setIsPasscodeEnabled, passcode, setPasscode, setIsUnlocked } = usePasscode();
  const { activeUserId, logout } = useAuth();
  const { refetch: refetchTx } = useTransactionsContext();
  const { refetch: refetchCats } = useCategories();

  const handleLogout = async () => {
      await logout();
      router.replace("/auth");
  };

  const handleTogglePasscode = (enabled: boolean) => {
      if (enabled) {
          // In a real app, we'd show a modal to set the code
          setPasscode("1234"); 
          setIsPasscodeEnabled(true);
          setIsUnlocked(false);
      } else {
          setIsPasscodeEnabled(false);
          setPasscode(null);
      }
  };

  const [autoBackup, setAutoBackup] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

  useEffect(() => {
    getSetting('autoBackup').then(val => {
      setAutoBackup(val !== 'false');
    });
  }, []);

  const handleToggleAutoBackup = async (val: boolean) => {
    setAutoBackup(val);
    await setSetting('autoBackup', val.toString());
  };

  const handleManualBackup = async () => {
    setIsSyncing(true);
    try {
      const txs = await getTransactions();
      const cats = await getCategories();
      const profile = await getUserProfile();
      
      if (profile) {
        // Find existing profile on API to get its ID for PATCH, or POST if none
        const check = await fetch(`${API_URL}/userProfiles?userId=${activeUserId}`);
        const existing = await check.json();
        
        const method = (existing && existing.length > 0) ? "PATCH" : "POST";
        const url = (existing && existing.length > 0) 
            ? `${API_URL}/userProfiles/${existing[0].id}` 
            : `${API_URL}/userProfiles`;

        await fetch(url, { 
          method, 
          headers: {"Content-Type": "application/json"}, 
          body: JSON.stringify({ ...profile, userId: activeUserId })
        }).catch(() => {});
      }
      for (const c of cats) {
        await fetch(`${API_URL}/categories`, { 
          method: "POST", 
          headers: {"Content-Type": "application/json"}, 
          body: JSON.stringify({ ...c, userId: activeUserId })
        }).catch(() => {});
      }
      for (const t of txs) {
        await fetch(`${API_URL}/transactions`, { 
          method: "POST", 
          headers: {"Content-Type": "application/json"}, 
          body: JSON.stringify({ ...t, categoryId: String(t.category.id), userId: activeUserId })
        }).catch(() => {});
      }
      
      alert("Backup completed!");
    } catch (e) {
      console.error(e);
      alert("Backup failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearData = async () => {
    if (pinInput === (passcode || "1234")) {
      setIsSyncing(true);
      try {
        if (activeUserId) {
          console.log("Syncing Clear Data to cloud for user:", activeUserId);
          // 1. Fetch user data from cloud
          const [txRes, catRes, profRes] = await Promise.all([
            fetch(`${API_URL}/transactions?userId=${activeUserId}`),
            fetch(`${API_URL}/categories?userId=${activeUserId}`),
            fetch(`${API_URL}/userProfiles?userId=${activeUserId}`)
          ]);

          const [txs, cats, profs] = await Promise.all([
            txRes.json(),
            catRes.json(),
            profRes.json()
          ]);

          // 2. Delete all from cloud
          const deletePromises = [
            ...(Array.isArray(txs) ? txs.map(t => fetch(`${API_URL}/transactions/${t.id}`, { method: "DELETE" })) : []),
            ...(Array.isArray(cats) ? cats.map(c => fetch(`${API_URL}/categories/${c.id}`, { method: "DELETE" })) : []),
            ...(Array.isArray(profs) ? profs.map(p => fetch(`${API_URL}/userProfiles/${p.id}`, { method: "DELETE" })) : [])
          ];

          await Promise.all(deletePromises);
          console.log("Cloud data cleared successfully");
        }

        // 3. Clear local
        await clearAllLocalData();
        setShowPinPrompt(false);
        setPinInput("");
        
        // 4. Refresh UI
        await Promise.all([
          refetchTx(),
          refetchCats(),
          refetchProfile()
        ]);
        
        alert("All local and cloud data has been cleared.");
        router.replace("/");
      } catch (e) {
        console.error("Clear data sync failed:", e);
        alert("Cleared local data, but cloud sync failed. Check your connection.");
        await clearAllLocalData();
        router.replace("/");
      } finally {
        setIsSyncing(false);
      }
    } else {
      alert("Incorrect PIN");
    }
  };

  const handleExportJSON = async () => {
    try {
      const json = await exportData();
      const fsAny = FileSystem as any;
      const fileUri = `${fsAny.documentDirectory}WiseWallet_Backup_${Date.now()}.json`;
      const encoding = fsAny.EncodingType ? fsAny.EncodingType.UTF8 : 'utf8';
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding });
      await Sharing.shareAsync(fileUri);
    } catch (e) {
      console.error(e);
      alert("Export failed");
    }
  };

  const handleImportJSON = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (!result.canceled && result.assets && result.assets.length > 0) {
          const fileUri = result.assets[0].uri;
          const fsAny = FileSystem as any;
          const encoding = fsAny.EncodingType ? fsAny.EncodingType.UTF8 : 'utf8';
          const jsonString = await FileSystem.readAsStringAsync(fileUri, { encoding });
          await importData(jsonString);
          alert("Import successful! Data has been restored. Please restart the app or switch accounts to see the changes.");
      }
    } catch (e) {
      console.error(e);
      alert("Import failed");
    }
  };
  
  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure? This will remove your account from this device and attempt to clear your cloud data. This action is permanent.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
        onPress: async () => {
          if (activeUserId) {
            setIsSyncing(true);
            try {
              // 1. Fetch user data from cloud to get IDs
              const [txRes, catRes, profRes] = await Promise.all([
                fetch(`${API_URL}/transactions?userId=${activeUserId}`),
                fetch(`${API_URL}/categories?userId=${activeUserId}`),
                fetch(`${API_URL}/userProfiles?userId=${activeUserId}`)
              ]);

              const [txs, cats, profs] = await Promise.all([
                txRes.json(),
                catRes.json(),
                profRes.json()
              ]);

              // 2. Delete all from cloud
              const deletePromises = [
                ...(Array.isArray(txs) ? txs.map(t => fetch(`${API_URL}/transactions/${t.id}`, { method: "DELETE" })) : []),
                ...(Array.isArray(cats) ? cats.map(c => fetch(`${API_URL}/categories/${c.id}`, { method: "DELETE" })) : []),
                ...(Array.isArray(profs) ? profs.map(p => fetch(`${API_URL}/userProfiles/${p.id}`, { method: "DELETE" })) : []),
                // Also delete from /users if applicable
                fetch(`${API_URL}/users/${activeUserId}`, { method: "DELETE" }).catch(() => {})
              ];

              await Promise.all(deletePromises);
              console.log("Cloud account data cleared successfully");
              
              // 3. Clear local tables (except master)
              await clearAllLocalData();
              
              // 4. Remove from master.db
              await deleteUser(activeUserId);
              
              // 5. Logout and redirect
              await logout();
              router.replace("/auth");
              alert("Account and all associated data deleted successfully.");
            } catch (e) {
              console.error("Delete account sync failed:", e);
              alert("Failed to fully clear cloud data. Account was deleted locally.");
              await clearAllLocalData();
              await deleteUser(activeUserId);
              await logout();
              router.replace("/auth");
            } finally {
              setIsSyncing(false);
            }
          }
        }
        }
      ]
    );
  };

  const performRestore = async () => {
    setIsSyncing(true);
    try {
      console.log("[Restore] Starting cloud restore for user:", activeUserId);
      console.log("[Restore] API URL:", API_URL);
      
      // Fetch all to catch legacy data (missing userId)
      const [txRes, catRes, profRes] = await Promise.all([
        fetch(`${API_URL}/transactions`),
        fetch(`${API_URL}/categories`),
        fetch(`${API_URL}/userProfiles`)
      ]);
      
      console.log("[Restore] Network status:", { 
        txs: txRes.status, 
        cats: catRes.status, 
        profs: profRes.status 
      });

      if (!txRes.ok || !catRes.ok || !profRes.ok) {
        console.error("[Restore] Cloud restore network error.");
        alert("Could not connect to the cloud API. Please check your connection.");
        return;
      }

      const allTxs = await txRes.json();
      const allCats = await catRes.json();
      const allProfs = await profRes.json();

      console.log("[Restore] Raw data received:", {
        txs: Array.isArray(allTxs) ? allTxs.length : "error",
        cats: Array.isArray(allCats) ? allCats.length : "error",
        profs: Array.isArray(allProfs) ? allProfs.length : "error"
      });

      // Filter strictly for this user as requested
      const remoteTxs = Array.isArray(allTxs) ? allTxs.filter((t: any) => String(t.userId) === String(activeUserId)) : [];
      const remoteCats = Array.isArray(allCats) ? allCats.filter((c: any) => String(c.userId) === String(activeUserId)) : [];
      const remoteProf = Array.isArray(allProfs) ? allProfs.find((p: any) => String(p.userId) === String(activeUserId)) : null;
      
      console.log("[Restore] Filtered data:", { 
        txs: remoteTxs.length, 
        cats: remoteCats.length, 
        profFound: !!remoteProf 
      });

      const currentSettings = { autoBackup: autoBackup.toString() };
      const cloudJson = JSON.stringify({
          profile: remoteProf,
          categories: remoteCats,
          transactions: remoteTxs,
          settings: currentSettings
      });
      
      await importData(cloudJson);
      
      // 5. Trigger automatic UI refresh
      // On Web, AsyncStorage can sometimes be slightly asynchronous even after resolving.
      // A small delay ensures the contexts read the freshly imported data.
      if (Platform.OS === 'web') {
          console.log("[Restore] Web platform detected, applying settling delay...");
          await new Promise(resolve => setTimeout(resolve, 200));
      }

      await Promise.all([
          refetchTx(),
          refetchCats(),
          refetchProfile()
      ]);

      alert("Cloud data restored locally and UI refreshed!");
    } catch (e) {
      console.error(e);
      alert("Restore failed. Make sure the API is online.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreFromCloud = () => {
    console.log("[Restore] Button clicked. Platform:", Platform.OS);
    if (Platform.OS === 'web') {
      const confirm = window.confirm("This will overwrite all your local data with the data from your cloud backup. Are you sure?");
      if (confirm) {
        performRestore();
      }
    } else {
      Alert.alert(
        "Restore from Cloud",
        "This will overwrite all your local data with the data from your cloud backup. Are you sure?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Restore", 
            style: "destructive", 
            onPress: performRestore 
          }
        ]
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: paperTheme.colors.background }}>
      <Appbar.Header style={{ backgroundColor: paperTheme.colors.background, elevation: 0 }}>
        <Appbar.Content title={t("settings")} titleStyle={{ fontWeight: "700" }} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* User Profile Section */}
        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Avatar.Text 
                size={48} 
                label={profile?.name?.substring(0, 2).toUpperCase() || "US"} 
                style={{ backgroundColor: paperTheme.colors.primary }}
              />
              <View style={{ marginLeft: 16 }}>
                <Text variant="titleMedium">{profile?.name || "Wise User"}</Text>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.outline }}>
                  Local Profile (Offline)
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* General Settings */}
        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>{t("categories")}</Text>
            <List.Item
              title={t("categories")}
              description="Manage income & expense categories"
              left={props => <List.Icon {...props} icon="shape-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push("/category-settings")}
            />
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>{t("appearance")}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <List.Icon icon="theme-light-dark" color={paperTheme.colors.onSurfaceVariant} />
                <Text variant="bodyLarge" style={{ marginLeft: 12 }}>{t("darkMode")}</Text>
              </View>
              <Switch value={isDarkMode} onValueChange={toggleTheme} />
            </View>

            <Divider style={{ marginVertical: 8 }} />

            <Text variant="titleSmall" style={{ marginTop: 8 }}>{t("language")}</Text>
            <RadioButton.Group onValueChange={(v) => setLanguage(v as "en" | "tl")} value={language}>
              <RadioButton.Item label="English" value="en" />
              <RadioButton.Item label="Filipino" value="tl" />
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>{t("currency")}</Text>
            <RadioButton.Group onValueChange={(value) => setCurrency(value as CurrencyCode)} value={currency.code}>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {Object.values(CURRENCIES).map((curr) => (
                    <View key={curr.code} style={{ width: "50%" }}>
                        <RadioButton.Item
                        label={curr.code}
                        value={curr.code}
                        status={currency.code === curr.code ? 'checked' : 'unchecked'}
                        />
                    </View>
                ))}
              </View>
            </RadioButton.Group>

            <Divider style={{ marginVertical: 8 }} />
            
            <Text variant="titleSmall" style={{ marginTop: 8 }}>Decimal Points</Text>
            <RadioButton.Group onValueChange={(v) => setDecimalPlaces(parseInt(v))} value={decimalPlaces.toString()}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <RadioButton.Item label="0" value="0" />
                  <RadioButton.Item label="1" value="1" />
                  <RadioButton.Item label="2" value="2" />
              </View>
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>Data Management</Text>
            
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <List.Icon icon="cloud-sync" color={paperTheme.colors.onSurfaceVariant} />
                <Text variant="bodyLarge" style={{ marginLeft: 12 }}>Auto-Backup</Text>
              </View>
              <Switch value={autoBackup} onValueChange={handleToggleAutoBackup} />
            </View>

            <Divider style={{ marginVertical: 8 }} />

            {!autoBackup && (
              <Button mode="outlined" icon="backup-restore" onPress={handleManualBackup} loading={isSyncing} disabled={isSyncing} style={{ marginVertical: 4 }}>
                 Backup Data to Cloud API Now
              </Button>
            )}

            {!autoBackup && (
              <Button mode="outlined" icon="cloud-download" onPress={handleRestoreFromCloud} loading={isSyncing} disabled={isSyncing} style={{ marginVertical: 4 }}>
                 Restore Data from Cloud API
              </Button>
            )}

            <Button mode="outlined" icon="file-export" onPress={handleExportJSON} style={{ marginVertical: 4 }}>
               Export Data (JSON)
            </Button>
            
            <Button mode="outlined" icon="file-import" onPress={handleImportJSON} style={{ marginVertical: 4 }}>
               Import Data (JSON)
            </Button>
            
            <Button mode="contained-tonal" buttonColor={paperTheme.colors.errorContainer} textColor={paperTheme.colors.onErrorContainer} icon="delete-alert" onPress={() => setShowPinPrompt(true)} style={{ marginTop: 8 }}>
               Clear All Data
            </Button>

          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>Account</Text>
            <Button mode="outlined" icon="account-switch" onPress={handleLogout} textColor={paperTheme.colors.primary} style={{ marginBottom: 8 }}>
               Switch Account / Logout
            </Button>
            <Button mode="contained-tonal" icon="account-remove" onPress={handleDeleteAccount} buttonColor={paperTheme.colors.errorContainer} textColor={paperTheme.colors.onErrorContainer}>
               Delete Account
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 16 }}>Security</Text>
            <View style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <List.Icon icon="lock-outline" color={paperTheme.colors.onSurfaceVariant} />
                  <Text variant="bodyLarge" style={{ marginLeft: 12 }}>{t("passcode")}</Text>
                </View>
                <Switch value={isPasscodeEnabled} onValueChange={handleTogglePasscode} />
              </View>
              <Text variant="bodySmall" style={{ marginLeft: 52, color: paperTheme.colors.outline }}>
                Require PIN to unlock the app on startup
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={showPinPrompt} onDismiss={() => setShowPinPrompt(false)}>
          <Dialog.Title>Enter PIN to Clear Data</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 16 }}>This action cannot be undone. All local data will be permanently deleted.</Text>
            <TextInput
              label="PIN"
              value={pinInput}
              onChangeText={setPinInput}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowPinPrompt(false)}>Cancel</Button>
            <Button onPress={handleClearData} textColor={paperTheme.colors.error}>Clear Data</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

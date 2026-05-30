import { useState, useEffect } from "react";
import { View, ScrollView, Alert, Platform, StyleSheet } from "react-native";
import { Appbar, List, RadioButton, Text, Card, Switch, Divider, Button, Avatar, Portal, Dialog, TextInput, useTheme as usePaperTheme, IconButton, Badge } from "react-native-paper";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { getSetting, setSetting, clearAllLocalData, getTransactions, getCategories, getUserProfile, getDues, getSavingsItems, exportData, importData, deleteUser, mergeLWW, saveTransactionsBulk, saveCategoriesBulk, saveDuesBulk, saveSavingsItemsBulk, saveUserProfile } from "../../utils/db";
import { useAuth } from "../../context/AuthContext";
import { useCurrency, CURRENCIES, CurrencyCode } from "../../context/CurrencyContext";
import { useAppTheme } from "../../context/ThemeContext";
import { useUserProfile } from "../../context/UserProfileContext";
import { useLanguage } from "../../context/LanguageContext";
import { usePasscode } from "../../context/PasscodeContext";
import { useTransactionsContext } from "../../context/TransactionsContext";
import { useCategories } from "../../context/CategoriesContext";
import { authFetch } from "../../utils/apiClient";
import { useSyncStatus } from "../../hooks/useSyncStatus";
import { useNetwork } from "../../context/NetworkContext";

function SyncStatusCard() {
  const { isOnline, checkConnectivity, isChecking } = useNetwork();
  const { pendingCount, lastSyncedAt, hasErrors, retryAll } = useSyncStatus();
  const paperTheme = usePaperTheme();

  const getStatusColor = () => {
    if (isChecking) return { icon: "cloud-sync", text: "Checking...", color: paperTheme.colors.primary };
    if (!isOnline) return { icon: "cloud-off", text: "Offline", color: paperTheme.colors.error };
    if (pendingCount > 0) return { icon: "upload", text: `${pendingCount} pending`, color: paperTheme.colors.tertiary };
    return { icon: "cloud-check", text: "All synced", color: paperTheme.colors.secondary };
  };

  const status = getStatusColor();

  const formatLastSync = () => {
    if (!lastSyncedAt) return "Never";
    const date = new Date(lastSyncedAt);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString();
  };

  return (
    <View style={[
      styles.syncCard,
      {
        backgroundColor: !isOnline
          ? paperTheme.colors.errorContainer
          : pendingCount > 0
          ? paperTheme.colors.tertiaryContainer
          : paperTheme.colors.secondaryContainer
      }
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <IconButton
          icon={status.icon}
          iconColor={status.color}
          size={24}
          style={{ margin: 0 }}
        />
        <View>
          <Text variant="titleSmall" style={{ color: status.color, fontWeight: '600' }}>
            {status.text}
          </Text>
          <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
            Last sync: {formatLastSync()}
          </Text>
        </View>
      </View>
      {pendingCount > 0 && isOnline && (
        <Button
          mode="text"
          compact
          icon="sync"
          onPress={retryAll}
          loading={isChecking}
        >
          Retry
        </Button>
      )}
      {!isOnline && (
        <Button
          mode="text"
          compact
          icon="refresh"
          onPress={() => checkConnectivity()}
          loading={isChecking}
        >
          Check
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
  }
});

export default function SettingsScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { currency, setCurrency, decimalPlaces, setDecimalPlaces } = useCurrency();
  const { theme, isDarkMode, toggleTheme } = useAppTheme();
  const { profile, updateProfile, resetProfileToDefaults, refetch: refetchProfile } = useUserProfile();
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

  const autoBackup = profile?.autoBackup ?? true;
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pinInput, setPinInput] = useState("");

   const setAutoBackup = async (value: boolean) => {
     await updateProfile({ autoBackup: value });
     await setSetting('autoBackup', value.toString());
   };

   const handleToggleAutoBackup = async (val: boolean) => {
     if (val) {
       setShowBackupDialog(true);
     } else {
       setAutoBackup(false);
     }
   };

   const proceedWithBackupEnable = async () => {
     setIsSyncing(true);
     setShowBackupDialog(false);
     try {
       const [txRes, catRes, profRes] = await Promise.all([
         authFetch(`transactions?userId=${activeUserId}`),
         authFetch(`categories?userId=${activeUserId}`),
         authFetch(`userProfiles?userId=${activeUserId}`)
       ]);
       const txs = await txRes.json();
       const cats = await catRes.json();
       const profs = await profRes.json();

       const hasCloudData = (Array.isArray(txs) && txs.length > 0) ||
         (Array.isArray(cats) && cats.length > 0) ||
         (Array.isArray(profs) && profs.length > 0);

        if (hasCloudData) {
          setShowConflictDialog(true);
        } else {
          setAutoBackup(true);
        }
     } catch (e) {
       console.error("Conflict check failed:", e);
       alert("Failed to check for server conflicts. Please check your connection.");
     } finally {
       setIsSyncing(false);
     }
   };

   const handleMergeLWW = async () => {
     setIsSyncing(true);
     setShowConflictDialog(false);

     try {
       console.log("[MergeLWW] Starting Last-Write-Wins merge...");

       const localTxs = await getTransactions();
       const localCats = await getCategories();
       const localDues = await getDues();
       const localSavings = await getSavingsItems();
       const localProfile = await getUserProfile();

       const [txRes, catRes, dueRes, savRes, profRes] = await Promise.all([
         authFetch(`transactions?userId=${activeUserId}`),
         authFetch(`categories?userId=${activeUserId}`),
         authFetch(`dues?userId=${activeUserId}`),
         authFetch(`savingsItems?userId=${activeUserId}`),
         authFetch(`userProfiles?userId=${activeUserId}`)
       ]);

       const remoteTxs = Array.isArray(await txRes.json()) ? await txRes.json() : [];
       const remoteCats = Array.isArray(await catRes.json()) ? await catRes.json() : [];
       const remoteDues = Array.isArray(await dueRes.json()) ? await dueRes.json() : [];
       const remoteSavings = Array.isArray(await savRes.json()) ? await savRes.json() : [];
       const remoteProfiles = Array.isArray(await profRes.json()) ? await profRes.json() : [];
       const remoteProfile = remoteProfiles[0] || null;

       const mergedTxs = mergeLWW(localTxs, remoteTxs);
       const mergedCats = mergeLWW(localCats, remoteCats);
       const mergedDues = mergeLWW(localDues, remoteDues);
       const mergedSavings = mergeLWW(localSavings, remoteSavings);

       console.log("[MergeLWW] Merged:", {
         transactions: mergedTxs.length,
         categories: mergedCats.length,
         dues: mergedDues.length,
         savingsItems: mergedSavings.length
       });

       await saveTransactionsBulk(mergedTxs);
       await saveCategoriesBulk(mergedCats);
       await saveDuesBulk(mergedDues);
       await saveSavingsItemsBulk(mergedSavings);

       if (localProfile && remoteProfile) {
         const localTs = (localProfile as any).updatedAt || 0;
         const remoteTs = (remoteProfile as any).updatedAt || 0;
         if (remoteTs > localTs) {
           await saveUserProfile(remoteProfile);
         }
       }

       await setAutoBackup(true);

       console.log("[MergeLWW] Uploading merged data to cloud...");

       if (localProfile || remoteProfile) {
         const mergedProfile = remoteProfile && ((remoteProfile as any).updatedAt || 0) > ((localProfile as any)?.updatedAt || 0)
           ? remoteProfile
           : localProfile;

         if (mergedProfile) {
           const profCheck = await authFetch(`userProfiles?userId=${activeUserId}`);
           const profExisting = await profCheck.json();

           if (Array.isArray(profExisting) && profExisting.length > 0) {
             await authFetch(`userProfiles/${profExisting[0].id}`, {
               method: "PUT",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ ...mergedProfile, userId: activeUserId })
             }).catch(() => {});
           } else {
             await authFetch(`userProfiles`, {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ ...mergedProfile, userId: activeUserId })
             }).catch(() => {});
           }
         }
       }

       for (const c of mergedCats) {
         const check = await authFetch(`categories?id=${c.id}`);
         const existing = await check.json();

         if (Array.isArray(existing) && existing.length > 0) {
           await authFetch(`categories/${c.id}`, {
             method: "PUT",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ ...c, userId: activeUserId })
           }).catch(() => {});
         } else {
           await authFetch(`categories`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ ...c, userId: activeUserId })
           }).catch(() => {});
         }
       }

       for (const d of mergedDues) {
         const check = await authFetch(`dues?id=${d.id}`);
         const existing = await check.json();

         if (Array.isArray(existing) && existing.length > 0) {
           await authFetch(`dues/${d.id}`, {
             method: "PUT",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ ...d, userId: activeUserId })
           }).catch(() => {});
         } else {
           await authFetch(`dues`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ ...d, userId: activeUserId })
           }).catch(() => {});
         }
       }

       for (const s of mergedSavings) {
         const check = await authFetch(`savingsItems?id=${s.id}`);
         const existing = await check.json();

         if (Array.isArray(existing) && existing.length > 0) {
           await authFetch(`savingsItems/${s.id}`, {
             method: "PUT",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ ...s, userId: activeUserId })
           }).catch(() => {});
         } else {
           await authFetch(`savingsItems`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ ...s, userId: activeUserId })
           }).catch(() => {});
         }
       }

       for (const t of mergedTxs) {
         const check = await authFetch(`transactions?id=${t.id}`);
         const existing = await check.json();

         const txData = {
           ...t,
           categoryId: t.category?.id ? String(t.category.id) : (t as any).categoryId,
           userId: activeUserId
         };

         if (Array.isArray(existing) && existing.length > 0) {
           await authFetch(`transactions/${t.id}`, {
             method: "PUT",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(txData)
           }).catch(() => {});
         } else {
           await authFetch(`transactions`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(txData)
           }).catch(() => {});
         }
       }

       await Promise.all([
         refetchTx(),
         refetchCats(),
         refetchProfile()
       ]);

       alert("Merge completed! Data has been synchronized using Last-Write-Wins.");
       console.log("[MergeLWW] Merge completed successfully");

     } catch (e) {
       console.error("[MergeLWW] Merge failed:", e);
       alert("Merge failed. Please check your connection and try again.");
     } finally {
       setIsSyncing(false);
     }
   };

   const handleManualBackup = async () => {
    setIsSyncing(true);
    try {
      const txs = await getTransactions();
      const cats = await getCategories();
      const profile = await getUserProfile();


      if (profile) {
        // Find existing profile on API to get its ID for PATCH, or POST if none
        const check = await authFetch(`userProfiles?userId=${activeUserId}`);
        const existing = await check.json();

        const method = (existing && existing.length > 0) ? "PATCH" : "POST";
        const url = (existing && existing.length > 0)
          ? `userProfiles/${existing[0].id}`
          : `userProfiles`;

        await authFetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...profile, userId: activeUserId })
        }).catch(() => { });
      }
      for (const c of cats) {
        await authFetch(`categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...c, userId: activeUserId })
        }).catch(() => { });
      }
      for (const t of txs) {
        console.log("Transaction", t);
        await authFetch(`transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...t, categoryId: t.category?.id ? String(t.category.id) : (t as any).categoryId, userId: activeUserId })
        }).catch(() => { });
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
          // 1. Fetch user data from cloud (Except Profile/User)
          const [txRes, catRes, dueRes, savRes] = await Promise.all([
            authFetch(`transactions?userId=${activeUserId}`),
            authFetch(`categories?userId=${activeUserId}`),
            authFetch(`dues?userId=${activeUserId}`),
            authFetch(`savingsItems?userId=${activeUserId}`)
          ]);

          const [txs, cats, dues, savs] = await Promise.all([
            txRes.json(),
            catRes.json(),
            dueRes.json(),
            savRes.json()
          ]);

          // 2. Delete all from cloud
          const deletePromises = [
            ...(Array.isArray(txs) ? txs.map(t => authFetch(`transactions/${t.id}`, { method: "DELETE" })) : []),
            ...(Array.isArray(cats) ? cats.map(c => authFetch(`categories/${c.id}`, { method: "DELETE" })) : []),
            ...(Array.isArray(dues) ? dues.map(d => authFetch(`dues/${d.id}`, { method: "DELETE" })) : []),
            ...(Array.isArray(savs) ? savs.map(s => authFetch(`savingsItems/${s.id}`, { method: "DELETE" })) : [])
          ];

          await Promise.all(deletePromises);
          console.log("Cloud transactional data cleared successfully");
        }

        // 3. Clear local
        await clearAllLocalData();
        await resetProfileToDefaults();
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
    setShowDeleteDialog(true);
  };

  const executeDelete = async () => {
    if (activeUserId) {
      setIsSyncing(true);
      try {
        await authFetch(`auth/account`, { method: "DELETE" });
        await clearAllLocalData();
        await deleteUser(activeUserId);
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
        setShowDeleteDialog(false);
      }
    }
  };

  const performRestore = async () => {
    setIsSyncing(true);
    try {
      console.log("[Restore] Starting cloud restore for user:", activeUserId);

      // Fetch all to catch legacy data (missing userId)
      const [txRes, catRes, profRes] = await Promise.all([
        authFetch(`transactions`),
        authFetch(`categories`),
        authFetch(`userProfiles`)
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
                   {autoBackup ? "Cloud Sync Enabled" : "Local Profile (Offline)"}
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

            <SyncStatusCard />

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

        <Card style={{ marginTop: 16 }}>
          <Card.Content>
            <Button mode="text" icon="help-circle-outline" onPress={() => router.push("/help")}>
              Help & FAQ
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Account</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: paperTheme.colors.error }}>WARNING: This action is permanent and cannot be undone.</Text>
            <Text style={{ marginTop: 8 }}>All your data in the cloud and on this device will be PERMANENTLY deleted. We recommend downloading a JSON backup first.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={executeDelete} textColor={paperTheme.colors.error} loading={isSyncing} disabled={isSyncing}>Delete Permanently</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={showBackupDialog} onDismiss={() => setShowBackupDialog(false)}>
          <Dialog.Title>Enable Auto-save</Dialog.Title>
          <Dialog.Content>
            <Text>Enabling Auto-save may overwrite your data during synchronization. Do you want to check for data on the server first?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowBackupDialog(false)}>Cancel</Button>
            <Button onPress={proceedWithBackupEnable} loading={isSyncing} disabled={isSyncing}>Proceed</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={showConflictDialog} onDismiss={() => setShowConflictDialog(false)}>
          <Dialog.Title>Sync Conflict</Dialog.Title>
          <Dialog.Content>
            <Text>We found data for your account on the server. How would you like to resolve this?</Text>
          </Dialog.Content>
           <Dialog.Actions style={{ flexDirection: 'column' }}>
              <Button mode="contained" onPress={handleMergeLWW} loading={isSyncing} disabled={isSyncing} style={{ width: '100%', marginBottom: 8 }}>
                Merge (Last Write Wins)
              </Button>
              <Button mode="outlined" onPress={() => { setShowConflictDialog(false); setAutoBackup(true); handleManualBackup(); }} style={{ width: '100%', marginBottom: 8 }}>
                Keep Local Only
              </Button>
              <Button mode="outlined" onPress={() => { setShowConflictDialog(false); setAutoBackup(true); performRestore(); }} style={{ width: '100%', marginBottom: 8 }}>
                Keep Cloud Only
              </Button>
              <Button onPress={() => setShowConflictDialog(false)}>Cancel</Button>
            </Dialog.Actions>
         </Dialog>

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

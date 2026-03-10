# Login Persistence Debugging Guide

This guide helps debug why login isn't persisting after closing the mobile app with "close all" button.

## Enhanced Logging Added

We've added comprehensive console logging throughout the authentication flow with emoji markers for easy identification in Android logcat.

### Login Flow (Expected Logs)

#### 1. App Startup - Auth Context Initialization
**File:** `/lib/client/auth-context.tsx`

```
⏳ [AuthContext] Starting sync...
📦 [AuthContext] Loaded from storage: { token: "...", username: "..." }
🔍 [AuthContext] Verification - values in localStorage: { tokenExists: true, usernameExists: true }
✅ [AuthContext] Sync complete, isInitialized = true
```

**What it means:**
- `⏳` Sync started
- `📦` Token and username were successfully read from localStorage
- `🔍` Verification confirms both values exist in localStorage
- `✅` Auth context is now initialized and components can render

If you see `🔍 { tokenExists: false, usernameExists: false }` → **Token was not persisted correctly**

#### 2. Home Page Redirect
**File:** `/app/page.tsx`

```
[Home] Auth state: { token: "...", username: "...", isInitialized: true }
[Home] Auth initialized. Token: EXISTS
[Home] Redirecting to /chat
```

**What it means:**
- `isInitialized: true` = waiting phase complete
- `Token: EXISTS` = Token found, user should be logged in
- Redirects to `/chat` page

If you see `Token: NULL` → **User not logged in, redirect to /login instead**

#### 3. Chat Page Initialization
**File:** `/app/chat/page.tsx`

```
[ChatPage] Auth state: { token: "...", username: "...", isInitialized: true }
[ChatPage] Auth initialized - checking token...
[ChatPage] Token found, loading conversations...
[ChatPage] ✅ Conversations loaded: 5
🔌 [ChatPage] Setting up WebSocket connection...
🔌 [ChatPage] activating client...
✅ [ChatPage] WebSocket connected
```

**What it means:**
- Auth state is loaded
- Conversations are loaded from API
- WebSocket connection established successfully

#### 4. Saving Token on Login
**File:** `/lib/client/auth-context.tsx` - `setAuthSync()` function

```
[AuthContext] setAuthSync called with: { newToken: "...", newUsername: "..." }
[AuthContext] State updated immediately
✅ [AuthContext] Token saved to localStorage
✅ [AuthContext] Username saved to localStorage
🔍 [AuthContext] Verification after save: { 
  tokenSaved: "...", 
  usernameSaved: "...", 
  tokenMatches: true, 
  usernameMatches: true 
}
```

**What it means:**
- Token was set in React state immediately
- Token was saved to localStorage asynchronously
- Verification confirms the saved values match what was set

If you see `tokenMatches: false` → **Token save failed**
If you see `❌ Failed to save to storage` → **Storage operation failed**

## How to Test

### Step 1: Build and Install APK
```bash
npm run build
npx cap sync android
./gradlew assembleDebug -p android
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Step 2: Clear App Data (Fresh Start)
```bash
adb shell pm clear com.getcapacitor.messenger  # or your app package name
```

### Step 3: Start Logcat in New Terminal
```bash
adb logcat | grep -E "AuthContext|Home|ChatPage"
```

### Step 4: Login and Check Logs
1. Open the app
2. You should see initial auth sync logs with `⏳`, `📦`, `🔍`, `✅`
3. Login with credentials
4. Check for `setAuthSync` logs with `✅` tokens saved

### Step 5: Force Close the App
1. Go to Settings → Apps → Messenger (or your app name)
2. Click "Force Stop"
3. OR: Use "Close All" button if your app has one

### Step 6: Reopen App and Check Logs
Look for:
- `⏳ Starting sync...` messages again
- `📦 Loaded from storage` with token and username
- `🔍 Verification` showing `tokenExists: true`

**If you see `tokenExists: false`:** The token was NOT persisted in localStorage

**If you see `tokenExists: true`:** The token WAS persisted but something else is wrong

## Common Issues & Solutions

### Issue 1: `tokenExists: false` on App Restart
**Problem:** Token is lost when app is force-closed

**Debug Steps:**
1. Check the login logs - do you see `✅ Token saved to localStorage`?
2. If NO `✅` messages → Storage save is failing
3. If YES `✅` messages but NO token on restart → Capacitor WebView is clearing storage

**Solution:**
- Mobile WebView might clear localStorage on force-close
- Need to use Capacitor Preferences API instead (more reliable on mobile)
- Or use Android SharedPreferences bridge

### Issue 2: `isInitialized: false` Keeps Showing
**Problem:** Auth context never finishes loading

**Debug Steps:**
1. Check for `⏳ Starting sync...` message
2. Check for `✅ Sync complete` message
3. Look for `❌ Failed to sync` error messages

**Solution:**
- Check browser console and Android logcat for errors
- Verify localStorage is accessible
- Check for permissions issues on Android

### Issue 3: Token Saves but Redirect Still Happens
**Problem:** Token exists but user still sent to login page

**Debug Steps:**
1. Look for `🔍 Verification` with `tokenExists: true`
2. Check if `[Home] Token: EXISTS` appears
3. Check if redirect to `/chat` or `/login` happens after that

**Solution:**
- Add more detailed logging in redirect logic
- Time-travel through logs to see exact sequence

### Issue 4: WebSocket Connection Fails
**Problem:** Chat page loads but can't send/receive messages

**Debug Steps:**
1. Look for `🔌 Setting up WebSocket connection...` logs
2. Look for `✅ WebSocket connected` or `❌ WebSocket error`
3. Check `onStompError` messages for connection details

**Solution:**
- Verify backend WebSocket is running
- Check firewall/CORS settings
- Verify token is valid (not expired)

## Logging Levels & Symbols

- `⏳` = Starting operation / Waiting
- `📦` = Data loaded / Received  
- `🔍` = Verification / Checking state
- `✅` = Success / Complete
- `❌` = Error / Failed
- `🔌` = Network operation

## Extracting Full Logs

To save logs for analysis:

```bash
# Save all app logs for 2 minutes
adb logcat > logs.txt &
# ... use app ...
sleep 120
kill $!

# Filter for Auth logs only
grep -E "AuthContext|Home|ChatPage" logs.txt > auth-logs.txt

# Save logs before and after force-close
adb logcat > before-close.txt &
# Force close app
sleep 5
adb logcat > after-close.txt &
sleep 10
kill %1 %2
```

## Key Files to Check

If debugging further:
- `/lib/capacitor-storage.ts` - Storage abstraction (uses localStorage)
- `/lib/client/auth-context.tsx` - Auth initialization & token management
- `/app/auth-wrapper.tsx` - AuthGuard that blocks rendering until initialized
- `/app/page.tsx` - Home page redirect logic
- `/app/chat/page.tsx` - Chat page auth checks

## Next Steps if Issue Persists

If token persists in localStorage but user is still redirected to login:
1. Check if `token` state variable is being properly set in auth context
2. Add logging to compare localStorage value vs React state value
3. Check if useAuth hook is returning stale values
4. Verify all pages import from `/lib/client/auth-context`

If token doesn't persist in localStorage on mobile:
1. Capacitor WebView might clear localStorage on force-close
2. Consider switching to Capacitor Preferences API (@capacitor/preferences)
3. Or implement Android SharedPreferences bridge
4. Test on real device vs emulator (behavior may differ)

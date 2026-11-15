package in.redchilly.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Scanner;

/**
 * Tells the server this phone's Firebase token, so new orders reach it as push notifications.
 * When the server confirms it can send pushes, the app stops watching for orders itself; if Firebase or the server
 * cannot do it, the watching service keeps running as the fallback.
 */
final class PushRegistrar {
    private static final String API = "https://redchilly.in/api/admin/push";

    private PushRegistrar() {}

    static boolean pushWorks(Context context) {
        return context.getSharedPreferences(OrderWatchService.PREFS, Context.MODE_PRIVATE).getBoolean("push_ok", false);
    }

    /** Gets the Firebase token (if Google Play services are present) and registers it for the signed-in account. */
    static void fetchAndRegister(Context context) {
        Context app = context.getApplicationContext();
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) register(app, task.getResult());
            });
        } catch (RuntimeException ignored) {
            // No Google Play services: the watching service covers it.
        }
    }

    static void register(Context context, String fcmToken) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(OrderWatchService.PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString("fcm_token", fcmToken).apply();
        String session = prefs.getString("token", "");
        if (session == null || session.isEmpty()) return;
        new Thread(() -> {
            try {
                JSONObject reply = post(session, "register", fcmToken);
                boolean enabled = reply != null && reply.optBoolean("enabled", false);
                prefs.edit().putBoolean("push_ok", enabled).apply();
                // Push is working, so the always-on watcher is not needed.
                if (enabled) app.stopService(new Intent(app, OrderWatchService.class));
                else OrderWatchService.startIfSignedIn(app);
            } catch (Exception ignored) {
                // Offline or refused: keep whatever is running now.
            }
        }, "push-register").start();
    }

    static void unregister(Context context, String session) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(OrderWatchService.PREFS, Context.MODE_PRIVATE);
        String fcm = prefs.getString("fcm_token", "");
        prefs.edit().putBoolean("push_ok", false).apply();
        if (fcm == null || fcm.isEmpty() || session == null || session.isEmpty()) return;
        new Thread(() -> {
            try {
                post(session, "unregister", fcm);
            } catch (Exception ignored) {
            }
        }, "push-unregister").start();
    }

    private static JSONObject post(String session, String action, String fcm) throws Exception {
        HttpURLConnection http = (HttpURLConnection) new URL(API).openConnection();
        http.setRequestMethod("POST");
        http.setConnectTimeout(8000);
        http.setReadTimeout(12000);
        http.setDoOutput(true);
        http.setRequestProperty("Content-Type", "application/json");
        http.setRequestProperty("Authorization", "Bearer " + session);
        try (OutputStream out = http.getOutputStream()) {
            out.write(new JSONObject().put("action", action).put("token", fcm).toString().getBytes("UTF-8"));
        }
        if (http.getResponseCode() != 200) return null;
        try (InputStream in = http.getInputStream(); Scanner scanner = new Scanner(in, "UTF-8").useDelimiter("\\A")) {
            return new JSONObject(scanner.hasNext() ? scanner.next() : "{}");
        }
    }
}

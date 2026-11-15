package in.redchilly.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Scanner;
import java.util.Set;

/**
 * Keeps running while the app is in the background and raises a notification for every new kitchen order.
 * It asks the server for today's orders every few seconds, the same call the Orders page makes.
 */
public class OrderWatchService extends Service {
    static final String PREFS = "session";
    private static final String API = "https://redchilly.in/api/admin/orders/manage";
    private static final String WATCH_CHANNEL = "watch";
    private static final String ORDER_CHANNEL = "orders";
    private static final long EVERY_MS = 10_000;
    private static final int MAX_SEEN = 300;

    private volatile boolean running;
    private Thread worker;
    private PowerManager.WakeLock wake;

    /** Starts the service when a kitchen or admin account is signed in on this phone. */
    static void startIfSignedIn(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        String token = prefs.getString("token", "");
        if (token == null || token.isEmpty() || prefs.getBoolean("push_ok", false)) return;
        try {
            Intent intent = new Intent(context, OrderWatchService.class);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (RuntimeException ignored) {
            // The system may refuse a start from the background; the next time the app opens it starts again.
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notifier.createChannels(this);
        Notification ongoing = Notifier.watching(this);
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(1, ongoing);

        if (!running) {
            running = true;
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "redchilly:orders");
            worker = new Thread(this::loop, "order-watch");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (worker != null) worker.interrupt();
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }

    private void loop() {
        while (running) {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            String token = prefs.getString("token", "");
            if (token == null || token.isEmpty()) {
                stopSelf();
                return;
            }
            try {
                wake.acquire(30_000);
                check(prefs, token);
            } catch (Exception ignored) {
                // No signal right now; try again on the next round.
            } finally {
                if (wake.isHeld()) wake.release();
            }
            try {
                Thread.sleep(EVERY_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    private void check(SharedPreferences prefs, String token) throws Exception {
        HttpURLConnection http = (HttpURLConnection) new URL(API).openConnection();
        http.setRequestMethod("POST");
        http.setConnectTimeout(8000);
        http.setReadTimeout(12000);
        http.setDoOutput(true);
        http.setRequestProperty("Content-Type", "application/json");
        http.setRequestProperty("Authorization", "Bearer " + token);
        try (OutputStream out = http.getOutputStream()) {
            out.write("{\"action\":\"list\"}".getBytes("UTF-8"));
        }
        int code = http.getResponseCode();
        if (code == 401 || code == 403) {
            // Signed out, deactivated, or not a kitchen account any more.
            prefs.edit().remove("token").apply();
            stopSelf();
            return;
        }
        if (code != 200) return;
        String body;
        try (InputStream in = http.getInputStream(); Scanner scanner = new Scanner(in, "UTF-8").useDelimiter("\\A")) {
            body = scanner.hasNext() ? scanner.next() : "[]";
        }
        JSONArray orders = new JSONArray(body);

        List<String> seen = new ArrayList<>(prefs.getStringSet("seen", new HashSet<>()));
        Set<String> seenSet = new HashSet<>(seen);
        boolean changed = false;
        for (int i = 0; i < orders.length(); i++) {
            JSONObject order = orders.getJSONObject(i);
            String id = order.optString("_id");
            if (id.isEmpty() || !"PENDING".equals(order.optString("status")) || seenSet.contains(id)) continue;
            notifyOrder(order, id);
            seenSet.add(id);
            seen.add(id);
            changed = true;
        }
        if (changed) {
            // Keep the list of already-announced orders from growing for ever.
            while (seen.size() > MAX_SEEN) seen.remove(0);
            prefs.edit().putStringSet("seen", new HashSet<>(seen)).apply();
        }
    }

    private void notifyOrder(JSONObject order, String id) {
        JSONObject place = order.optJSONObject("rooms_tables");
        String where = place == null ? "" : (place.optString("type").replace('_', ' ').toLowerCase() + " " + place.optString("code")).trim();
        JSONArray items = order.optJSONArray("order_items");
        Notifier.newOrder(this, id, where, items == null ? 0 : items.length());
    }
}

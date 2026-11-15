package in.redchilly.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/** The notifications the app shows: the always-on "watching" one and one per new kitchen order. */
final class Notifier {
    static final String WATCH_CHANNEL = "watch";
    static final String ORDER_CHANNEL = "orders";
    static final String ORDERS_URL = "https://redchilly.in/admin/orders";

    private Notifier() {}

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(new NotificationChannel(WATCH_CHANNEL, "Order watching", NotificationManager.IMPORTANCE_MIN));
        NotificationChannel orders = new NotificationChannel(ORDER_CHANNEL, "New kitchen orders", NotificationManager.IMPORTANCE_HIGH);
        orders.enableVibration(true);
        orders.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        manager.createNotificationChannel(orders);
    }

    static PendingIntent openApp(Context context, String url) {
        Intent intent = new Intent(context, MainActivity.class).putExtra("open", url).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Notification watching(Context context) {
        return new Notification.Builder(context, WATCH_CHANNEL)
                .setSmallIcon(Icon.createWithResource(context, R.drawable.ic_notify))
                .setContentTitle("Red Chilly")
                .setContentText("Watching for new kitchen orders")
                .setOngoing(true)
                .setContentIntent(openApp(context, ORDERS_URL))
                .build();
    }

    /** One notification per order; the same order shown twice (push and watching) replaces itself. */
    static void newOrder(Context context, String orderId, String where, int lines) {
        createChannels(context);
        String text = (where == null || where.isEmpty() ? "New order" : where) + (lines > 0 ? " · " + lines + " item" + (lines == 1 ? "" : "s") : "");
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, ORDER_CHANNEL) : new Notification.Builder(context);
        builder.setSmallIcon(Icon.createWithResource(context, R.drawable.ic_notify))
                .setContentTitle("New kitchen order")
                .setContentText(text)
                .setCategory(Notification.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(openApp(context, ORDERS_URL));
        if (Build.VERSION.SDK_INT < 26) builder.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(orderId.hashCode(), builder.build());
    }
}

package in.redchilly.app;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Receives the server's pushes. They are data messages, so this runs even when the app is closed. */
public class FcmService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        PushRegistrar.register(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"order".equals(data.get("kind"))) return;
        String id = data.get("id");
        int lines = 0;
        try {
            lines = Integer.parseInt(data.get("items"));
        } catch (RuntimeException ignored) {
        }
        Notifier.newOrder(this, id == null || id.isEmpty() ? String.valueOf(System.currentTimeMillis()) : id, data.get("where"), lines);
    }
}

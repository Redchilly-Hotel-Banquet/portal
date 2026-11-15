package in.redchilly.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts order watching again after the phone restarts or the app is updated. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        OrderWatchService.startIfSignedIn(context);
    }
}

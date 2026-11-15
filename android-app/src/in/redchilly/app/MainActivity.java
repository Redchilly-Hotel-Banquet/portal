package in.redchilly.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.print.PrintAttributes;
import android.print.PrintJob;
import android.print.PrintManager;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.FrameLayout;

/** The Red Chilly website (staff portal and guest site) in a full-screen WebView, with file upload, camera and printing. */
public class MainActivity extends Activity {
    private static final String HOME = "https://redchilly.in/";
    private static final String HOST = "redchilly.in";
    private static final int FILE_REQUEST = 1;
    private static final int CAMERA_REQUEST = 2;
    private static final int NOTIFY_REQUEST = 3;

    private WebView web;
    private ProgressBar progress;
    private ValueCallback<Uri[]> filePicker;
    private PermissionRequest pendingCamera;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(progress, new FrameLayout.LayoutParams(-1, 8));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "RedChillyApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                // Google refuses sign-in inside a WebView, so it runs in the browser and comes back through redchilly://open.
                if (HOST.equals(host) && uri.getPath() != null && uri.getPath().equals("/api/auth/google")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri.buildUpon().appendQueryParameter("app", "1").build()));
                    } catch (ActivityNotFoundException ignored) {
                    }
                    return true;
                }
                if (("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && host != null && (host.equals(HOST) || host.endsWith("." + HOST))) {
                    return false;
                }
                // Phone, mail, WhatsApp, maps and other sites open in the app meant for them.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap icon) {
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                // window.print() does nothing in a WebView; send it to Android's print service instead.
                view.evaluateJavascript("window.print=function(){RedChillyApp.print();};", null);
                // Tell the app who is signed in, now and whenever that changes, so it can watch for kitchen orders.
                view.evaluateJavascript("(function(){if(window.__rcSync)return;window.__rcSync=1;var s=function(){try{RedChillyApp.setSession(localStorage.getItem('adminJwt')||'',localStorage.getItem('adminUser')||'');}catch(e){}};s();setInterval(s,5000);})();", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    filePicker = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Only the camera, and only for the Red Chilly site (the QR scanner uses it).
                if (!HOST.equals(request.getOrigin().getHost())) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    pendingCamera = request;
                    requestPermissions(new String[] {Manifest.permission.CAMERA}, CAMERA_REQUEST);
                }
            }
        });

        // Android 13 and later ask before showing notifications.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFY_REQUEST);
        }
        OrderWatchService.startIfSignedIn(this);
        PushRegistrar.fetchAndRegister(this);

        if (state != null) web.restoreState(state);
        else web.loadUrl(opened(getIntent()));
    }

    /** A tapped order notification opens the Orders page; otherwise the home page. */
    private String opened(Intent intent) {
        String url = intent == null ? null : intent.getStringExtra("open");
        // The finished Google sign-in: redchilly://open?u=<the completion page on redchilly.in>.
        if (url == null && intent != null && intent.getData() != null && "redchilly".equals(intent.getData().getScheme())) {
            url = intent.getData().getQueryParameter("u");
        }
        return url != null && url.startsWith(HOME) ? url : HOME;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getStringExtra("open") != null || intent.getData() != null) web.loadUrl(opened(intent));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_REQUEST && filePicker != null) {
            filePicker.onReceiveValue(resultCode == RESULT_OK ? android.webkit.WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null);
            filePicker = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == CAMERA_REQUEST && pendingCamera != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingCamera.grant(pendingCamera.getResources());
            else pendingCamera.deny();
            pendingCamera = null;
        }
    }

    /** Phones stop background apps to save battery; ask once to let this one keep running. */
    private void askToStayAwake() {
        SharedPreferences prefs = getSharedPreferences(OrderWatchService.PREFS, MODE_PRIVATE);
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (prefs.getBoolean("asked_battery", false) || power.isIgnoringBatteryOptimizations(getPackageName())) return;
        prefs.edit().putBoolean("asked_battery", true).apply();
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Called from the page's window.print(). */
    private class Bridge {
        /** The staff session in the page. Kitchen and admin accounts get order notifications in the background. */
        @JavascriptInterface
        public void setSession(String token, String userJson) {
            boolean kitchen = false;
            try {
                if (token != null && !token.isEmpty() && userJson != null && !userJson.isEmpty()) {
                    org.json.JSONArray roles = new org.json.JSONObject(userJson).optJSONArray("roles");
                    for (int i = 0; roles != null && i < roles.length(); i++) {
                        String role = roles.optString(i);
                        if (role.equals("admin") || role.equals("kitchen")) kitchen = true;
                    }
                }
            } catch (org.json.JSONException ignored) {
            }
            SharedPreferences prefs = getSharedPreferences(OrderWatchService.PREFS, MODE_PRIVATE);
            String saved = prefs.getString("token", "");
            String next = kitchen ? token : "";
            if (next.equals(saved)) return;
            if (kitchen) {
                prefs.edit().putString("token", next).putBoolean("push_ok", false).apply();
                main.post(() -> {
                    // Watch for orders right away; once push is confirmed working the watcher is stopped again.
                    OrderWatchService.startIfSignedIn(MainActivity.this);
                    PushRegistrar.fetchAndRegister(MainActivity.this);
                    askToStayAwake();
                });
            } else {
                PushRegistrar.unregister(MainActivity.this, saved);
                prefs.edit().remove("token").apply();
                main.post(() -> stopService(new Intent(MainActivity.this, OrderWatchService.class)));
            }
        }

        @JavascriptInterface
        public void print() {
            main.post(() -> {
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                String name = "Red Chilly";
                final PrintJob job = manager.print(name, web.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                // The page waits for "afterprint" to clear what it printed, so send it once the job has ended.
                final Runnable[] check = new Runnable[1];
                check[0] = () -> {
                    if (job.isCompleted() || job.isCancelled() || job.isFailed()) {
                        web.evaluateJavascript("window.dispatchEvent(new Event('afterprint'));", null);
                    } else {
                        main.postDelayed(check[0], 1000);
                    }
                };
                main.postDelayed(check[0], 1000);
            });
        }
    }
}

package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.gulforigin.finance.MainActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void freshInstallReachesOwnerSignInThroughNativeSecureStorage() throws Exception {
        assertEquals("com.gulforigin.finance", InstrumentationRegistry.getInstrumentation()
            .getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertNotNull("SecureVault must exist when the WebView is created",
                    activity.getBridge().getPlugin("SecureVault"));
            });
            long deadline = SystemClock.elapsedRealtime() + 30000;
            String body = "";
            while (SystemClock.elapsedRealtime() < deadline) {
                CountDownLatch response = new CountDownLatch(1);
                AtomicReference<String> text = new AtomicReference<>("");
                scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                    "document.body ? document.body.innerText : ''", value -> {
                        text.set(value);
                        response.countDown();
                    }));
                assertTrue("WebView must respond", response.await(5, TimeUnit.SECONDS));
                body = text.get();
                if (body.contains("Sign in securely")) break;
                SystemClock.sleep(100);
            }
            assertTrue("Fresh native startup should show owner sign-in. Actual screen: " + body,
                body.contains("Sign in securely"));
            assertFalse(body.contains("Opening your workspace"));
            assertFalse(body.contains("Unable to open your workspace"));
        }
    }
}

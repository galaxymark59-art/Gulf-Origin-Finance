package com.gulforigin.finance;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle savedInstanceState){
  // BridgeActivity creates the bridge during super.onCreate(). Register first.
  registerPlugin(SecureVaultPlugin.class);
  super.onCreate(savedInstanceState);
  getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,WindowManager.LayoutParams.FLAG_SECURE);
 }
}

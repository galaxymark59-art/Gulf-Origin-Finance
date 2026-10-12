package com.gulforigin.finance;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;
@CapacitorPlugin(name="SecureVault")
public class SecureVaultPlugin extends Plugin {
 private final Object mutex=new Object();
 private SharedPreferences preferences(){return getContext().getSharedPreferences("gulf-secure-vault",Context.MODE_PRIVATE);}
 private SecretKey key() throws Exception {
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias("gulf-session-key")){
   KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   generator.init(new KeyGenParameterSpec.Builder("gulf-session-key",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
   generator.generateKey();
  }
  return (SecretKey)store.getKey("gulf-session-key",null);
 }
 @PluginMethod public void get(PluginCall call){synchronized(mutex){try{
  String value=preferences().getString(call.getString("key"),null);
  if(value==null){call.resolve(new JSObject().put("value",JSONObject.NULL));return;}
  String[] parts=value.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
  cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
  String plain=new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
  call.resolve(new JSObject().put("value",plain));
 }catch(Exception e){call.reject("Secure storage could not be read.");}}}
 @PluginMethod public void set(PluginCall call){synchronized(mutex){try{
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
  String value=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(call.getString("value","").getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
  if(!preferences().edit().putString(call.getString("key"),value).commit())throw new Exception();
  call.resolve();
 }catch(Exception e){call.reject("Secure storage could not be saved.");}}}
 @PluginMethod public void remove(PluginCall call){synchronized(mutex){if(preferences().edit().remove(call.getString("key")).commit())call.resolve();else call.reject("Secure storage could not be updated.");}}
 @PluginMethod public void biometric(PluginCall call){getActivity().runOnUiThread(()->{
  BiometricPrompt prompt=new BiometricPrompt(getActivity(),ContextCompat.getMainExecutor(getContext()),new BiometricPrompt.AuthenticationCallback(){
   @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result){call.resolve();}
   @Override public void onAuthenticationError(int code,@NonNull CharSequence message){call.reject("Biometric verification cancelled or unavailable.");}
  });
  prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Gulf Origin").setSubtitle("Verify your identity to open your records").setNegativeButtonText("Use app PIN").build());
 });}
 @PluginMethod public void download(PluginCall call){
  if(Build.VERSION.SDK_INT<29){call.reject("Downloads requires Android 10 or newer.");return;}
  Uri uri=null;
  try{String name=call.getString("name","Gulf-Origin.pdf").replaceAll("[^a-zA-Z0-9._-]","_");
   ContentValues values=new ContentValues();values.put(MediaStore.Downloads.DISPLAY_NAME,name);values.put(MediaStore.Downloads.MIME_TYPE,call.getString("mime","application/pdf"));values.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Gulf Origin");values.put(MediaStore.Downloads.IS_PENDING,1);
   uri=getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);if(uri==null)throw new Exception();
   try(OutputStream out=getContext().getContentResolver().openOutputStream(uri)){if(out==null)throw new Exception();out.write(Base64.decode(call.getString("base64",""),Base64.DEFAULT));}
   ContentValues ready=new ContentValues();ready.put(MediaStore.Downloads.IS_PENDING,0);getContext().getContentResolver().update(uri,ready,null,null);
   call.resolve(new JSObject().put("uri",uri.toString()));
  }catch(Exception e){if(uri!=null)getContext().getContentResolver().delete(uri,null,null);call.reject("File could not be saved. Check available storage and retry.");}
 }
}

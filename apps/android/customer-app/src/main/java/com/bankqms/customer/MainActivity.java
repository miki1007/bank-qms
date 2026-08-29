package com.bankqms.customer;

import android.graphics.Color;
import com.bankqms.shell.BaseWebActivity;

public final class MainActivity extends BaseWebActivity {
    @Override protected String getStartUrl() { return BuildConfig.START_URL; }
    @Override protected String getApplicationLabel() { return "Bank QMS Customer"; }
    @Override protected int getAccentColor() { return Color.rgb(8, 99, 77); }
    @Override protected String getUserAgentSuffix() { return "BankQMSCustomer/1.0"; }
}

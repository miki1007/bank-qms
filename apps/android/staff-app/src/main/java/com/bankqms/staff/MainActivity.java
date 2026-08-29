package com.bankqms.staff;

import android.graphics.Color;
import com.bankqms.shell.BaseWebActivity;

public final class MainActivity extends BaseWebActivity {
    @Override protected String getStartUrl() { return BuildConfig.START_URL; }
    @Override protected String getApplicationLabel() { return "Bank QMS Staff"; }
    @Override protected int getAccentColor() { return Color.rgb(55, 107, 181); }
    @Override protected String getUserAgentSuffix() { return "BankQMSStaff/1.0"; }
}

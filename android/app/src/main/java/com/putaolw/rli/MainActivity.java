package com.putaolw.rli;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String PREFS = "rli_calendar";
    private static final String KEY_SERVER = "server_url";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);

    private EditText serverInput;
    private EditText titleInput;
    private EditText timeInput;
    private EditText noteInput;
    private Spinner priorityInput;
    private DatePicker datePicker;
    private TextView statusText;
    private LinearLayout selectedEventsList;
    private JSONArray cachedEvents = new JSONArray();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        loadServerConfig();
        renderSelectedEvents();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }

    private void buildUi() {
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(Color.rgb(255, 247, 238));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(22), dp(18), dp(28));
        scrollView.addView(root);

        TextView title = text("日历同步", 28, true);
        root.addView(title);

        TextView subtitle = text("配置服务器后，登记的事情会立刻同步到网页端。", 14, false);
        subtitle.setTextColor(Color.rgb(128, 95, 72));
        subtitle.setPadding(0, dp(4), 0, dp(18));
        root.addView(subtitle);

        root.addView(label("服务器地址"));
        serverInput = input("例如：http://你的服务器IP:14785", false);
        root.addView(serverInput);

        Button checkButton = button("保存并检查服务器");
        checkButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                checkServer();
            }
        });
        root.addView(checkButton);

        statusText = text("还没有检查服务器", 14, false);
        statusText.setTextColor(Color.rgb(128, 95, 72));
        statusText.setPadding(0, dp(8), 0, dp(18));
        root.addView(statusText);

        root.addView(label("选择日期"));
        Date today = new Date();
        datePicker = new DatePicker(this);
        datePicker.init(
                today.getYear() + 1900,
                today.getMonth(),
                today.getDate(),
                new DatePicker.OnDateChangedListener() {
                    @Override
                    public void onDateChanged(DatePicker view, int year, int monthOfYear, int dayOfMonth) {
                        renderSelectedEvents();
                    }
                }
        );
        root.addView(datePicker);

        root.addView(label("时间"));
        timeInput = input("例如：09:30（可不填）", false);
        root.addView(timeInput);

        root.addView(label("轻重缓急"));
        priorityInput = new Spinner(this);
        ArrayAdapter<String> priorityAdapter = new ArrayAdapter<String>(
                this,
                android.R.layout.simple_spinner_item,
                new String[]{"紧急", "重要", "普通", "不急"}
        );
        priorityAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        priorityInput.setAdapter(priorityAdapter);
        priorityInput.setSelection(2);
        root.addView(priorityInput);

        root.addView(label("要做的事情"));
        titleInput = input("例如：开会、交材料、买药", false);
        root.addView(titleInput);

        root.addView(label("备注"));
        noteInput = input("可不填", true);
        root.addView(noteInput);

        Button saveButton = button("登记到服务器");
        saveButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                saveEvent();
            }
        });
        root.addView(saveButton);

        Button refreshButton = secondaryButton("刷新当天事情");
        refreshButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                fetchEvents();
            }
        });
        root.addView(refreshButton);

        TextView listTitle = text("当天已登记", 18, true);
        listTitle.setPadding(0, dp(18), 0, dp(8));
        root.addView(listTitle);

        selectedEventsList = new LinearLayout(this);
        selectedEventsList.setOrientation(LinearLayout.VERTICAL);
        root.addView(selectedEventsList);

        setContentView(scrollView);
    }

    private TextView label(String value) {
        TextView view = text(value, 14, true);
        view.setTextColor(Color.rgb(92, 64, 45));
        view.setPadding(0, dp(12), 0, dp(6));
        return view;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(Color.rgb(59, 42, 31));
        if (bold) {
            view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        }
        return view;
    }

    private EditText input(String hint, boolean multiLine) {
        EditText editText = new EditText(this);
        editText.setHint(hint);
        editText.setSingleLine(!multiLine);
        editText.setMinLines(multiLine ? 3 : 1);
        editText.setGravity(multiLine ? Gravity.TOP : Gravity.CENTER_VERTICAL);
        editText.setTextColor(Color.rgb(59, 42, 31));
        editText.setHintTextColor(Color.rgb(150, 120, 96));
        editText.setBackgroundColor(Color.WHITE);
        editText.setPadding(dp(10), dp(8), dp(10), dp(8));
        return editText;
    }

    private Button button(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.rgb(230, 126, 69));
        button.setAllCaps(false);
        button.setPadding(0, dp(8), 0, dp(8));
        return button;
    }

    private Button secondaryButton(String value) {
        Button button = button(value);
        button.setTextColor(Color.rgb(59, 42, 31));
        button.setBackgroundColor(Color.rgb(255, 226, 202));
        return button;
    }

    private void loadServerConfig() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        serverInput.setText(prefs.getString(KEY_SERVER, ""));
    }

    private void saveServerConfig(String serverUrl) {
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(KEY_SERVER, serverUrl)
                .apply();
    }

    private String normalizeServerUrl() {
        String raw = serverInput.getText().toString().trim();
        if (raw.length() == 0) {
            return "";
        }
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
            raw = "http://" + raw;
        }
        while (raw.endsWith("/")) {
            raw = raw.substring(0, raw.length() - 1);
        }
        return raw;
    }

    private void checkServer() {
        final String serverUrl = normalizeServerUrl();
        if (serverUrl.length() == 0) {
            setStatus("请先填写服务器地址，例如 http://1.2.3.4:14785", true);
            return;
        }

        saveServerConfig(serverUrl);
        serverInput.setText(serverUrl);
        setStatus("正在检查服务器...", false);

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String response = request("GET", serverUrl + "/api/health", null);
                    JSONObject json = new JSONObject(response);
                    if (!json.optBoolean("ok")) {
                        throw new Exception("服务器返回异常");
                    }
                    setStatus("服务器已连接：" + json.optString("name", "OK"), false);
                    fetchEvents();
                } catch (Exception error) {
                    setStatus("连接失败：" + error.getMessage(), true);
                }
            }
        });
    }

    private void saveEvent() {
        final String serverUrl = normalizeServerUrl();
        final String title = titleInput.getText().toString().trim();
        final String time = normalizeTime(timeInput.getText().toString().trim());
        final String priority = selectedPriority();
        final String note = noteInput.getText().toString().trim();

        if (serverUrl.length() == 0) {
            setStatus("请先填写并检查服务器地址", true);
            return;
        }

        if (title.length() == 0) {
            setStatus("请填写要做的事情", true);
            return;
        }

        if (time == null) {
            setStatus("时间格式请填写 HH:mm，例如 09:30", true);
            return;
        }

        saveServerConfig(serverUrl);
        setStatus("正在登记...", false);

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("date", selectedDate());
                    body.put("time", time);
                    body.put("priority", priority);
                    body.put("title", title);
                    body.put("note", note);
                    request("POST", serverUrl + "/api/events", body.toString());

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            titleInput.setText("");
                            timeInput.setText("");
                            priorityInput.setSelection(2);
                            noteInput.setText("");
                        }
                    });
                    setStatus("已登记，并同步到网页端", false);
                    fetchEvents();
                } catch (Exception error) {
                    setStatus("登记失败：" + error.getMessage(), true);
                }
            }
        });
    }

    private void fetchEvents() {
        final String serverUrl = normalizeServerUrl();
        if (serverUrl.length() == 0) {
            renderSelectedEvents();
            return;
        }

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String response = request("GET", serverUrl + "/api/events", null);
                    JSONObject json = new JSONObject(response);
                    cachedEvents = json.optJSONArray("events");
                    if (cachedEvents == null) {
                        cachedEvents = new JSONArray();
                    }
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            renderSelectedEvents();
                        }
                    });
                } catch (Exception error) {
                    setStatus("刷新失败：" + error.getMessage(), true);
                }
            }
        });
    }

    private void renderSelectedEvents() {
        String date = selectedDate();
        selectedEventsList.removeAllViews();
        boolean hasEvents = false;
        for (int index = 0; index < cachedEvents.length(); index++) {
            JSONObject item = cachedEvents.optJSONObject(index);
            if (item == null || !date.equals(item.optString("date"))) {
                continue;
            }
            hasEvents = true;
            String itemTime = item.optString("time");
            StringBuilder builder = new StringBuilder();
            builder.append(priorityLabel(item.optString("priority"))).append("  ");
            if (itemTime.length() > 0) {
                builder.append(itemTime).append(" ");
            }
            builder.append(item.optString("title"));
            String note = item.optString("note");
            if (note.length() > 0) {
                builder.append("\n  ").append(note);
            }
            selectedEventsList.addView(eventRow(
                    item.optString("id"),
                    item.optString("priority"),
                    builder.toString()
            ));
        }

        if (!hasEvents) {
            TextView empty = text(date + "\n还没有登记事情。", 15, false);
            empty.setTextColor(Color.rgb(128, 95, 72));
            empty.setPadding(dp(12), dp(12), dp(12), dp(12));
            empty.setBackgroundColor(Color.rgb(255, 250, 244));
            selectedEventsList.addView(empty);
        }
    }

    private View eventRow(final String eventId, String priority, String content) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(12), dp(10), dp(12), dp(10));
        row.setBackgroundColor(priorityColor(priority));

        TextView contentView = text(content, 15, false);
        contentView.setLineSpacing(0, 1.2f);
        row.addView(contentView);

        Button deleteButton = secondaryButton("取消这件事");
        deleteButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                deleteEvent(eventId);
            }
        });
        row.addView(deleteButton);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(10));
        row.setLayoutParams(params);
        return row;
    }

    private void deleteEvent(final String eventId) {
        final String serverUrl = normalizeServerUrl();
        if (serverUrl.length() == 0 || eventId.length() == 0) {
            setStatus("请先填写并检查服务器地址", true);
            return;
        }

        setStatus("正在取消...", false);
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    request("DELETE", serverUrl + "/api/events/" + eventId, null);
                    setStatus("已取消，并同步到网页端", false);
                    fetchEvents();
                } catch (Exception error) {
                    setStatus("取消失败：" + error.getMessage(), true);
                }
            }
        });
    }

    private String selectedDate() {
        String year = String.valueOf(datePicker.getYear());
        String month = String.format(Locale.US, "%02d", datePicker.getMonth() + 1);
        String day = String.format(Locale.US, "%02d", datePicker.getDayOfMonth());
        return year + "-" + month + "-" + day;
    }

    private String normalizeTime(String raw) {
        if (raw.length() == 0) {
            return "";
        }

        String[] parts = raw.split(":", -1);
        if (parts.length != 2) {
            return null;
        }

        try {
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || parts[1].length() != 2) {
                return null;
            }
            return String.format(Locale.US, "%02d:%02d", hour, minute);
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private String selectedPriority() {
        int position = priorityInput.getSelectedItemPosition();
        if (position == 0) {
            return "urgent";
        }
        if (position == 1) {
            return "high";
        }
        if (position == 3) {
            return "low";
        }
        return "normal";
    }

    private String priorityLabel(String priority) {
        if ("urgent".equals(priority)) {
            return "紧急";
        }
        if ("high".equals(priority)) {
            return "重要";
        }
        if ("low".equals(priority)) {
            return "不急";
        }
        return "普通";
    }

    private int priorityColor(String priority) {
        if ("urgent".equals(priority)) {
            return Color.rgb(255, 224, 219);
        }
        if ("high".equals(priority)) {
            return Color.rgb(255, 232, 197);
        }
        if ("low".equals(priority)) {
            return Color.rgb(231, 243, 223);
        }
        return Color.rgb(255, 226, 202);
    }

    private void setStatus(final String message, final boolean isError) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                statusText.setText(message);
                statusText.setTextColor(isError ? Color.rgb(185, 74, 58) : Color.rgb(77, 122, 60));
            }
        });
    }

    private String request(String method, String address, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");

        if (body != null) {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            OutputStream stream = connection.getOutputStream();
            stream.write(bytes);
            stream.close();
        }

        int code = connection.getResponseCode();
        InputStream stream = code >= 200 && code < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        String response = readStream(stream);
        connection.disconnect();

        if (code < 200 || code >= 300) {
            throw new Exception("HTTP " + code + " " + response);
        }

        return response;
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = stream.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        stream.close();
        return output.toString("UTF-8");
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}

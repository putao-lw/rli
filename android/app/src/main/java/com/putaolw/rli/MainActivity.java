package com.putaolw.rli;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
import java.util.Calendar;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String PREFS = "rli_calendar";
    private static final String KEY_SERVER = "server_url";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private EditText serverInput;
    private EditText titleInput;
    private EditText startTimeInput;
    private EditText endTimeInput;
    private EditText noteInput;
    private Spinner priorityInput;
    private DatePicker datePicker;
    private TextView statusText;
    private TextView selectedDateTitle;
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
        root.setPadding(dp(16), dp(18), dp(16), dp(28));
        scrollView.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        TextView title = text("日历同步", 30, true);
        root.addView(title);

        TextView subtitle = text("登记时间段后会马上同步到网页端。时间过了，主日历会自动隐藏，点开日期仍然能查看。", 14, false);
        subtitle.setTextColor(Color.rgb(128, 95, 72));
        subtitle.setPadding(0, dp(5), 0, dp(14));
        root.addView(subtitle);

        LinearLayout serverCard = card();
        serverCard.addView(sectionTitle("服务器"));
        serverCard.addView(label("服务器地址"));
        serverInput = input("例如：http://你的服务器IP:14785", false);
        serverCard.addView(serverInput);

        Button checkButton = primaryButton("保存并检查服务器");
        checkButton.setOnClickListener(view -> checkServer());
        serverCard.addView(withTopMargin(checkButton, 10));

        statusText = text("还没有检查服务器", 14, false);
        statusText.setTextColor(Color.rgb(128, 95, 72));
        statusText.setPadding(0, dp(10), 0, 0);
        serverCard.addView(statusText);
        root.addView(withBottomMargin(serverCard, 14));

        LinearLayout formCard = card();
        formCard.addView(sectionTitle("登记事情"));
        formCard.addView(label("选择日期"));
        Calendar today = Calendar.getInstance();
        datePicker = new DatePicker(this);
        datePicker.init(
                today.get(Calendar.YEAR),
                today.get(Calendar.MONTH),
                today.get(Calendar.DAY_OF_MONTH),
                (view, year, monthOfYear, dayOfMonth) -> {
                    if (selectedEventsList != null) {
                        renderSelectedEvents();
                    }
                }
        );
        formCard.addView(datePicker);

        LinearLayout timeRow = new LinearLayout(this);
        timeRow.setOrientation(LinearLayout.HORIZONTAL);
        timeRow.setGravity(Gravity.CENTER);
        timeRow.addView(timeColumn("开始时间", true), weightParams(1, 0, 5, 0, 0));
        timeRow.addView(timeColumn("结束时间", false), weightParams(1, 5, 0, 0, 0));
        formCard.addView(timeRow);

        formCard.addView(label("轻重缓急"));
        priorityInput = new Spinner(this);
        ArrayAdapter<String> priorityAdapter = new ArrayAdapter<>(
                this,
                android.R.layout.simple_spinner_item,
                new String[]{"一  最急", "二  较急", "三  一般", "四  不急"}
        );
        priorityAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        priorityInput.setAdapter(priorityAdapter);
        priorityInput.setSelection(2);
        priorityInput.setBackground(inputBackground());
        priorityInput.setPadding(dp(8), dp(5), dp(8), dp(5));
        formCard.addView(priorityInput);

        formCard.addView(label("要做的事情"));
        titleInput = input("例如：开会、交材料、复诊", false);
        formCard.addView(titleInput);

        formCard.addView(label("备注"));
        noteInput = input("可不填", true);
        formCard.addView(noteInput);

        Button saveButton = primaryButton("添加到选中日期");
        saveButton.setOnClickListener(view -> saveEvent());
        formCard.addView(withTopMargin(saveButton, 12));
        root.addView(withBottomMargin(formCard, 14));

        LinearLayout listCard = card();
        LinearLayout listHead = new LinearLayout(this);
        listHead.setOrientation(LinearLayout.HORIZONTAL);
        listHead.setGravity(Gravity.CENTER_VERTICAL);
        selectedDateTitle = text("", 18, true);
        listHead.addView(selectedDateTitle, weightParams(1, 0, 10, 0, 0));
        Button refreshButton = secondaryButton("刷新");
        refreshButton.setOnClickListener(view -> fetchEvents());
        listHead.addView(refreshButton);
        listCard.addView(listHead);

        selectedEventsList = new LinearLayout(this);
        selectedEventsList.setOrientation(LinearLayout.VERTICAL);
        listCard.addView(withTopMargin(selectedEventsList, 12));
        root.addView(listCard);

        setContentView(scrollView);
    }

    private LinearLayout timeColumn(String label, boolean isStart) {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.addView(label(label));
        EditText input = input(isStart ? "09:00" : "10:30", false);
        if (isStart) {
            startTimeInput = input;
        } else {
            endTimeInput = input;
        }
        column.addView(input);
        return column;
    }

    private LinearLayout card() {
        LinearLayout view = new LinearLayout(this);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(14), dp(14), dp(14), dp(14));
        view.setBackground(cardBackground(Color.rgb(255, 255, 255)));
        return view;
    }

    private TextView sectionTitle(String value) {
        TextView view = text(value, 20, true);
        view.setPadding(0, 0, 0, dp(6));
        return view;
    }

    private TextView label(String value) {
        TextView view = text(value, 14, true);
        view.setTextColor(Color.rgb(92, 64, 45));
        view.setPadding(0, dp(10), 0, dp(6));
        return view;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(Color.rgb(59, 42, 31));
        if (bold) {
            view.setTypeface(Typeface.DEFAULT_BOLD);
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
        editText.setBackground(inputBackground());
        editText.setPadding(dp(12), dp(9), dp(12), dp(9));
        return editText;
    }

    private Button primaryButton(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(Color.WHITE);
        button.setTextSize(15);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackground(buttonBackground(Color.rgb(230, 126, 69)));
        button.setAllCaps(false);
        button.setMinHeight(dp(46));
        return button;
    }

    private Button secondaryButton(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(Color.rgb(201, 95, 42));
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackground(buttonBackground(Color.rgb(255, 226, 202)));
        button.setAllCaps(false);
        button.setMinHeight(dp(42));
        return button;
    }

    private GradientDrawable cardBackground(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(8));
        drawable.setStroke(dp(1), Color.rgb(239, 214, 189));
        return drawable;
    }

    private GradientDrawable inputBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.rgb(255, 250, 244));
        drawable.setCornerRadius(dp(8));
        drawable.setStroke(dp(1), Color.rgb(239, 214, 189));
        return drawable;
    }

    private GradientDrawable buttonBackground(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(8));
        return drawable;
    }

    private View withTopMargin(View view, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(top), 0, 0);
        view.setLayoutParams(params);
        return view;
    }

    private View withBottomMargin(View view, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(bottom));
        view.setLayoutParams(params);
        return view;
    }

    private LinearLayout.LayoutParams weightParams(float weight, int left, int right, int top, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, weight);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
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

        executor.execute(() -> {
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
        });
    }

    private void saveEvent() {
        final String serverUrl = normalizeServerUrl();
        final String title = titleInput.getText().toString().trim();
        final String startTime = normalizeTime(startTimeInput.getText().toString().trim());
        final String endTime = normalizeTime(endTimeInput.getText().toString().trim());
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

        if (startTime == null || endTime == null) {
            setStatus("时间格式请填写 HH:mm，例如 09:30", true);
            return;
        }

        if (startTime.length() > 0 && endTime.length() > 0 && minutes(endTime) <= minutes(startTime)) {
            setStatus("结束时间要晚于开始时间", true);
            return;
        }

        saveServerConfig(serverUrl);
        setStatus("正在登记...", false);

        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("date", selectedDate());
                body.put("time", startTime);
                body.put("startTime", startTime);
                body.put("endTime", endTime);
                body.put("priority", priority);
                body.put("title", title);
                body.put("note", note);
                request("POST", serverUrl + "/api/events", body.toString());

                mainHandler.post(() -> {
                    titleInput.setText("");
                    startTimeInput.setText("");
                    endTimeInput.setText("");
                    priorityInput.setSelection(2);
                    noteInput.setText("");
                });
                setStatus("已登记，并同步到网页端", false);
                fetchEvents();
            } catch (Exception error) {
                setStatus("登记失败：" + error.getMessage(), true);
            }
        });
    }

    private void fetchEvents() {
        final String serverUrl = normalizeServerUrl();
        if (serverUrl.length() == 0) {
            renderSelectedEvents();
            return;
        }

        executor.execute(() -> {
            try {
                String response = request("GET", serverUrl + "/api/events", null);
                JSONObject json = new JSONObject(response);
                cachedEvents = json.optJSONArray("events");
                if (cachedEvents == null) {
                    cachedEvents = new JSONArray();
                }
                mainHandler.post(this::renderSelectedEvents);
            } catch (Exception error) {
                setStatus("刷新失败：" + error.getMessage(), true);
            }
        });
    }

    private void renderSelectedEvents() {
        String date = selectedDate();
        selectedDateTitle.setText(date + " 的事情");
        selectedEventsList.removeAllViews();

        boolean hasEvents = false;
        for (int index = 0; index < cachedEvents.length(); index++) {
            JSONObject item = cachedEvents.optJSONObject(index);
            if (item == null || !date.equals(item.optString("date"))) {
                continue;
            }

            hasEvents = true;
            selectedEventsList.addView(eventRow(item));
        }

        if (!hasEvents) {
            TextView empty = text("这一天还没有登记事情。", 15, false);
            empty.setTextColor(Color.rgb(128, 95, 72));
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(12), dp(16), dp(12), dp(16));
            empty.setBackground(cardBackground(Color.rgb(255, 250, 244)));
            selectedEventsList.addView(empty);
        }
    }

    private View eventRow(final JSONObject item) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(12), dp(11), dp(12), dp(12));
        row.setBackground(cardBackground(priorityColor(item.optString("priority"))));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);

        TextView mark = text(priorityMark(item.optString("priority")), 14, true);
        mark.setGravity(Gravity.CENTER);
        GradientDrawable markBg = buttonBackground(Color.argb(70, 255, 255, 255));
        mark.setBackground(markBg);
        top.addView(mark, fixedParams(30, 30, 0, 8, 0, 0));

        LinearLayout textBlock = new LinearLayout(this);
        textBlock.setOrientation(LinearLayout.VERTICAL);
        TextView time = text(formatTimeRange(item), 13, false);
        time.setTextColor(Color.rgb(128, 95, 72));
        textBlock.addView(time);
        TextView title = text(item.optString("title"), 16, true);
        title.setPadding(0, dp(2), 0, 0);
        textBlock.addView(title);

        String note = item.optString("note");
        if (note.length() > 0) {
            TextView noteView = text(note, 13, false);
            noteView.setTextColor(Color.rgb(128, 95, 72));
            noteView.setPadding(0, dp(6), 0, 0);
            textBlock.addView(noteView);
        }

        top.addView(textBlock, weightParams(1, 0, 0, 0, 0));
        row.addView(top);

        Button deleteButton = secondaryButton("取消这件事");
        deleteButton.setOnClickListener(view -> deleteEvent(item.optString("id")));
        row.addView(withTopMargin(deleteButton, 10));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(10));
        row.setLayoutParams(params);
        return row;
    }

    private LinearLayout.LayoutParams fixedParams(int width, int height, int left, int right, int top, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(width), dp(height));
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private void deleteEvent(final String eventId) {
        final String serverUrl = normalizeServerUrl();
        if (serverUrl.length() == 0 || eventId.length() == 0) {
            setStatus("请先填写并检查服务器地址", true);
            return;
        }

        setStatus("正在取消...", false);
        executor.execute(() -> {
            try {
                request("DELETE", serverUrl + "/api/events/" + eventId, null);
                setStatus("已取消，并同步到网页端", false);
                fetchEvents();
            } catch (Exception error) {
                setStatus("取消失败：" + error.getMessage(), true);
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

    private int minutes(String time) {
        String[] parts = time.split(":", -1);
        return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
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

    private String priorityMark(String priority) {
        if ("urgent".equals(priority)) {
            return "一";
        }
        if ("high".equals(priority)) {
            return "二";
        }
        if ("low".equals(priority)) {
            return "四";
        }
        return "三";
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

    private String formatTimeRange(JSONObject item) {
        String start = item.optString("startTime", item.optString("time"));
        String end = item.optString("endTime");
        if (start.length() > 0 && end.length() > 0) {
            return start + "-" + end;
        }
        if (start.length() > 0) {
            return start;
        }
        if (end.length() > 0) {
            return "至 " + end;
        }
        return "全天";
    }

    private void setStatus(final String message, final boolean isError) {
        mainHandler.post(() -> {
            statusText.setText(message);
            statusText.setTextColor(isError ? Color.rgb(185, 74, 58) : Color.rgb(77, 122, 60));
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

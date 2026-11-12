const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let savedUser = null;
try {
savedUser = JSON.parse(localStorage.getItem("parknest_user") || "null");
} catch (error) {
localStorage.removeItem("parknest_user");
}
const state = {
token: localStorage.getItem("parknest_token") || "",
user: savedUser,
page: "overview",
dashboard: null,
slots: [],
vehicles: [],
sessions: [],
payments: [],
violations: [],
guardRequests: [],
filter: "",
ownerBookingData: {
vehicles: [],
slots: [],
sessions: []
}
};
let toastTimer;
const money = n =>
"৳" + Number(n || 0).toLocaleString("en-BD", {
maximumFractionDigits: 2
});
const dateTime = value =>
value
? new Date(value).toLocaleString("en-GB", {
day: "2-digit",
month: "short",
hour: "2-digit",
minute: "2-digit"
})
: "—";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#39;"
}[char]));
const isAdmin = () =>
    String(state.user?.role || "").trim().toLowerCase() === "admin";
const isGuard = () => state.user?.role === "guard";
const isOwner = () => state.user?.role === "owner";
const canOperateParking = () => isAdmin() || isGuard();
const canManageVehicles = () => isAdmin() || isGuard();
function validatePassword(password) {
return {
length: password.length >= 8,
lowercase: /[a-z]/.test(password),
uppercase: /[A-Z]/.test(password),
number: /[0-9]/.test(password),
special: /[^A-Za-z0-9]/.test(password)
};
}
function updatePasswordRules() {
const password = $("#setupPassword");
if (!password) return;
const rules = validatePassword(password.value);
const elements = {
length: "ruleLength",
lowercase: "ruleLower",
uppercase: "ruleUpper",
number: "ruleNumber",
special: "ruleSpecial"
};
const labels = {
length: "At least 8 characters",
lowercase: "One lowercase letter (a-z)",
uppercase: "One uppercase letter (A-Z)",
number: "One number (0-9)",
special: "One special character (@#$!)"
};
Object.entries(elements).forEach(([key, id]) => {
const element = document.getElementById(id);
if (!element) return;
element.textContent = (rules[key] ? "✓ " : "○ ") + labels[key];
element.classList.toggle("valid", rules[key]);
});
}
function toast(message, type = "success") {
const element = $("#toast");
if (!element) {
console.log(message);
return;
}
element.textContent = message;
element.className = "toast show " + type;
clearTimeout(toastTimer);
toastTimer = setTimeout(() => {
element.className = "toast";
}, 3400);
}
async function api(url, options = {}) {
const headers = { ...(options.headers || {}) };
if (options.body && !headers["Content-Type"]) {
headers["Content-Type"] = "application/json";
}
if (state.token) {
headers.Authorization = "Bearer " + state.token;
}
let response;
try {
response = await fetch(url, {
...options,
headers
});
} catch (error) {
throw new Error("Cannot connect to ParkNest server. Please run npm start.");
}
let data = {};
try {
data = await response.json();
} catch (error) {
data = {};
}
if (!response.ok) {
throw new Error(
data.error ||
data.message ||
"Something went wrong."
);
}
return data;
}
function showAuth() {
$("#authScreen")?.classList.remove("hidden");
$("#app")?.classList.add("hidden");
}
function showApp() {
$("#authScreen")?.classList.add("hidden");
$("#app")?.classList.remove("hidden");
const name = state.user?.name || state.user?.full_name || "ParkNest User";
const role = state.user?.role || "owner";
const initial = name.trim().charAt(0).toUpperCase() || "P";
if ($("#userName")) $("#userName").textContent = name;
if ($("#userRole")) $("#userRole").textContent = role;
if ($("#userAvatar")) $("#userAvatar").textContent = initial;
if ($("#topAvatar")) $("#topAvatar").textContent = initial;
$$(".admin-only").forEach(element => {
element.classList.toggle("hidden", !isAdmin());
});
$$(".operator-only").forEach(element => {
element.classList.toggle("hidden", !canOperateParking());
});
if ($("#todayDate")) {
$("#todayDate").textContent = new Date().toLocaleDateString("en-GB", {
day: "2-digit",
month: "short",
year: "numeric"
});
}
navigate("overview");
}
function signOut() {
state.token = "";
state.user = null;
state.page = "overview";
localStorage.removeItem("parknest_token");
localStorage.removeItem("parknest_user");
showAuth();
toast("You have signed out.");
}
function authSwitch() {
const setup = $("#setupForm");
const login = $("#loginForm");
if (!setup || !login) return;
const registrationWasHidden = setup.classList.contains("hidden");
setup.classList.toggle("hidden", !registrationWasHidden);
login.classList.toggle("hidden", registrationWasHidden);
if ($("#authTitle")) {
$("#authTitle").textContent = registrationWasHidden
? "Create your account."
: "Good to see you.";
}
if ($("#authSubtitle")) {
$("#authSubtitle").textContent = registrationWasHidden
? "Join ParkNest and manage your parking."
: "Sign in to your campus parking workspace.";
}
if ($("#switchText")) {
$("#switchText").textContent = registrationWasHidden
? "Already have an account?"
: "New to ParkNest?";
}
if ($("#switchAuth")) {
$("#switchAuth").textContent = registrationWasHidden
? "Sign in"
: "Create account";
}
if (registrationWasHidden) updatePasswordRules();
}
$("#switchAuth")?.addEventListener("click", authSwitch);
function updateGuardFields() {
const guardSelected = $("#setupRole")?.value === "guard";
$("#guardFields")?.classList.toggle("hidden", !guardSelected);
if ($("#guardPhone")) $("#guardPhone").required = guardSelected;
if ($("#guardGate")) $("#guardGate").required = guardSelected;
}
$("#setupRole")?.addEventListener("change", updateGuardFields);
document.addEventListener("input", event => {
if (event.target.id === "setupPassword") updatePasswordRules();
});
$("#loginForm")?.addEventListener("submit", async event => {
event.preventDefault();
const button = event.submitter || $("#loginForm button[type='submit']");
if (button) button.disabled = true;
try {
const email = $("#loginEmail")?.value.trim();
const password = $("#loginPassword")?.value;
if (!email || !password) {
throw new Error("Please enter email and password.");
}
const result = await api("/api/auth/login", {
method: "POST",
body: JSON.stringify({ email, password })
});
if (!result.token || !result.user) {
throw new Error("Invalid login response from server.");
}
state.token = result.token;
state.user = result.user;
localStorage.setItem("parknest_token", result.token);
localStorage.setItem("parknest_user", JSON.stringify(result.user));
showApp();
toast("Welcome back, " +
(result.user.name || result.user.full_name || "User").split(" ")[0] + ".");
} catch (error) {
toast(error.message, "error");
} finally {
if (button) button.disabled = false;
}
});
$("#setupForm")?.addEventListener("submit", async event => {
event.preventDefault();
const button = event.submitter || $("#setupForm button[type='submit']");
if (button) button.disabled = true;
try {
const role = $("#setupRole")?.value || "owner";
const name = $("#setupName")?.value.trim();
const email = $("#setupEmail")?.value.trim();
const password = $("#setupPassword")?.value;
if (!name || !email || !password) {
throw new Error("Please fill in all required fields.");
}
if (!Object.values(validatePassword(password)).every(Boolean)) {
updatePasswordRules();
throw new Error("Please meet all password requirements.");
}
let endpoint = "/api/auth/register";
let payload = { name, email, password };
if (role === "guard") {
const phone = $("#guardPhone")?.value.trim();
const assigned_gate = $("#guardGate")?.value;
if (!phone || !assigned_gate) {
throw new Error("Phone number and assigned gate are required.");
}
endpoint = "/api/auth/register-guard";
payload = { name, email, phone, assigned_gate, password };
}
const result = await api(endpoint, {
method: "POST",
body: JSON.stringify(payload)
});
toast(result.message || (
role === "guard"
? "Guard application submitted. Wait for Admin approval."
: "Owner account created successfully."
));
$("#setupForm").reset();
updateGuardFields();
updatePasswordRules();
authSwitch();
if ($("#loginEmail")) $("#loginEmail").value = email;
if ($("#loginPassword")) {
$("#loginPassword").value = "";
$("#loginPassword").focus();
}
} catch (error) {
toast(error.message, "error");
} finally {
if (button) button.disabled = false;
}
});

/* =========================================
   PARKNEST - PREMIUM LOGOUT BUTTON
   Admin + Owner + Guard
========================================= */

const logoutButton = $("#logoutBtn");

if (logoutButton) {
    logoutButton.type = "button";
    logoutButton.classList.add("logout-btn");

    logoutButton.innerHTML = `
        <span class="logout-icon" aria-hidden="true">↪</span>
        <span class="logout-text">Logout</span>
    `;

    logoutButton.addEventListener("click", signOut);
}

$("#menuBtn")?.addEventListener("click", () => {
$("#sidebar")?.classList.toggle("open");
});
$("#helpBtn")?.addEventListener("click", openHelp);
$("#closeModal")?.addEventListener("click", closeModal);
$("#modal")?.addEventListener("click", event => {
if (event.target === $("#modal")) closeModal();
});
$$(".nav-item[data-page]").forEach(button => {
button.addEventListener("click", () => navigate(button.dataset.page));
});
async function navigate(page) {
if (page === "reports" && !isAdmin()) {
toast("Reports are available to administrators only.", "error");
return;
}
if (page === "guards" && !isAdmin()) {
toast("Only Admin can manage Guard applications.", "error");
return;
}
const allowedPages = [
"overview", "parking", "vehicles", "sessions",
"payments", "violations", "reports", "guards"
];
if (!allowedPages.includes(page)) page = "overview";
state.page = page;
state.filter = "";
$("#sidebar")?.classList.remove("open");
$$(".nav-item").forEach(button => {
button.classList.toggle("active", button.dataset.page === page);
});
const labels = {
overview: "Overview",
parking: "Live parking",
vehicles: "Vehicles",
sessions: "Parking history",
payments: "Payments",
violations: "Violations",
reports: "Reports",
guards: "Guard Applications"
};
if ($("#breadcrumbPage")) $("#breadcrumbPage").textContent = labels[page];
if ($("#pageTitle")) {
$("#pageTitle").innerHTML = page === "overview"
? 'Good morning <span class="wave">✦</span>'
: labels[page];
}
if ($("#pageContent")) {
$("#pageContent").innerHTML =
'<div class="loading"><span class="spinner"></span> Preparing your workspace…</div>';
}
try {
if (page === "overview") {
if (isOwner()) {
await loadOwnerBookingData();
renderOwnerOverview();
} else {
state.dashboard = await api("/api/dashboard");
state.slots = await api("/api/slots");
renderOverview();
}
} else if (page === "parking") {
state.slots = await api("/api/slots");
if (isOwner()) await loadOwnerBookingData();
renderParking();
} else if (page === "vehicles") {
state.vehicles = await api("/api/vehicles");
renderVehicles();
} else if (page === "sessions") {
state.sessions = await api("/api/sessions");
renderSessions();
} else if (page === "payments") {
state.payments = await api("/api/payments");
renderPayments();
} else if (page === "violations") {
state.violations = await api("/api/violations");
renderViolations();
} else if (page === "reports") {
renderReports(await api("/api/reports"));
} else if (page === "guards") {
state.guardRequests = await api("/api/admin/guard-requests");
renderGuardRequests(state.guardRequests);
}
} catch (error) {
$("#pageContent").innerHTML = `
<div class="panel empty-state">
<strong>We couldn't load this page.</strong>
<p>${esc(error.message)}</p>
<button class="btn" style="margin-top:14px"
onclick="navigate('${page}')">Try again</button>
</div>`;
}
}
function stat(label, value, icon, subtitle, colour = "") {
return `
<article class="stat-card">
<div class="stat-top">
<span>${label}</span>
<span class="stat-icon ${colour}">${icon}</span>
</div>
<div class="stat-number">${value}</div>
<div class="stat-foot">${subtitle}</div>
</article>`;
}
function panelHead(title, subtitle, action = "", onclick = "") {
return `
<div class="panel-head">
<div>
<h4 class="panel-title">${title}</h4>
<div class="panel-subtitle">${subtitle}</div>
</div>
${action
? `<button class="text-link" onclick="${onclick}">${action} ↗</button>`
: ""}
</div>`;
}
async function loadOwnerBookingData() {
if (!isOwner()) return true;
try {
const [vehicles, slots, sessions] = await Promise.all([
api("/api/vehicles"),
api("/api/slots"),
api("/api/sessions")
]);
state.ownerBookingData.vehicles = Array.isArray(vehicles) ? vehicles : [];
state.ownerBookingData.slots = Array.isArray(slots) ? slots : [];
state.ownerBookingData.sessions = Array.isArray(sessions) ? sessions : [];
state.vehicles = state.ownerBookingData.vehicles;
state.slots = state.ownerBookingData.slots;
state.sessions = state.ownerBookingData.sessions;
return true;
} catch (error) {
toast(error.message || "Booking information load failed.", "error");
return false;
}
}
function getOwnerActiveBooking() {
return state.ownerBookingData.sessions.find(session =>
session.status === "active"
) || null;
}
function getAvailableOwnerSlots() {
return state.ownerBookingData.slots.filter(slot => {
const active = Number(slot.is_active) === 1;
const occupied = Boolean(slot.session_id);
return active && !occupied;
});
}
async function bookOwnerSlot(vehicleId, slotId) {
if (!isOwner()) {
toast("Only Owners can book parking slots.", "error");
return;
}
if (!vehicleId || !slotId) {
toast("Please select a vehicle and parking slot.", "error");
return;
}
if (getOwnerActiveBooking()) {
toast("You already have an active booking.", "error");
return;
}
try {
const result = await api("/api/owner/bookings", {
method: "POST",
body: JSON.stringify({
vehicle_id: Number(vehicleId),
slot_id: Number(slotId)
})
});
toast(result.message || "Parking slot successfully booked.");
await loadOwnerBookingData();
await navigate("parking");
} catch (error) {
toast(error.message, "error");
}
}
async function releaseOwnerBooking(bookingId) {
if (!isOwner()) {
toast("Only Owners can release their booking.", "error");
return;
}
if (!bookingId) {
toast("Booking ID not found.", "error");
return;
}
if (!confirm("Are you sure you want to release this parking slot?")) {
return;
}
try {
const result = await api(
`/api/owner/bookings/${Number(bookingId)}/release`,
{ method: "POST" }
);
toast(result.message || "Parking slot successfully released.");
await loadOwnerBookingData();
await navigate("parking");
} catch (error) {
toast(error.message, "error");
}
}
function renderOwnerBookingPanel() {
if (!isOwner()) return "";
const vehicles = state.ownerBookingData.vehicles;
const approvedVehicles = vehicles.filter(vehicle => vehicle.approval_status === "approved");
const pendingVehicles = vehicles.filter(vehicle => vehicle.approval_status === "pending");
const rejectedVehicles = vehicles.filter(vehicle => vehicle.approval_status === "rejected");
const activeBooking = getOwnerActiveBooking();
const availableSlots = getAvailableOwnerSlots();
if (activeBooking) {
return `
<section class="panel" style="margin-bottom:18px">
<h3>My Active Booking</h3>
<p>Your parking slot is currently reserved.</p>
<div class="booking-information">
<p><strong>Vehicle:</strong> ${esc(activeBooking.plate_number || "N/A")}</p>
<p><strong>Slot:</strong> ${esc(activeBooking.slot_code || "N/A")}</p>
<p><strong>Zone:</strong> ${esc(activeBooking.zone || "N/A")}</p>
<p><strong>Status:</strong> Active</p>
</div>
<button class="btn" type="button"
onclick="releaseOwnerBooking(${Number(activeBooking.id)})">
Release My Slot
</button>
</section>`;
}
if (!vehicles.length) {
return `
<section class="panel" style="margin-bottom:18px">
<h3>Register Your Vehicle First</h3>
<p>You have not registered any vehicle yet. Register your vehicle before booking a parking slot.</p>
<button class="btn btn-dark" type="button"
onclick="openVehicleModal()">
+ Register My Vehicle
</button>
</section>`;
}
if (!approvedVehicles.length) {
return `
<section class="panel" style="margin-bottom:18px">
<h3>Vehicle Approval Required</h3>
${pendingVehicles.length
? `<p>${pendingVehicles.length} vehicle(s) are waiting for Admin approval. You can book a parking slot after approval.</p>`
: `<p>Your registered vehicle has not been approved. Please contact Admin or register another vehicle.</p>`}
${rejectedVehicles.length
? `<p>Rejected vehicles: ${rejectedVehicles.map(vehicle => esc(vehicle.plate_number)).join(", ")}</p>`
: ""}
</section>`;
}
if (!availableSlots.length) {
return `
<section class="panel" style="margin-bottom:18px">
<h3>Book a Parking Slot</h3>
<p>Currently no parking slot is available.</p>
</section>`;
}
return `
<section class="panel" style="margin-bottom:18px">
<h3>Book a Parking Slot</h3>
<p>Select your vehicle and an available parking slot.</p>
<div class="form-group">
<label for="ownerBookingVehicle">Select Your Vehicle</label>
<select id="ownerBookingVehicle" class="field-select">
<option value="">Choose Vehicle</option>
${approvedVehicles.map(vehicle => `
<option value="${Number(vehicle.id)}">
${esc(vehicle.plate_number)} (${esc(vehicle.vehicle_type)})
</option>
`).join("")}
</select>
</div>
<div class="form-group">
<label for="ownerBookingSlot">Select Available Slot</label>
<select id="ownerBookingSlot" class="field-select">
<option value="">Choose Parking Slot</option>
${availableSlots.map(slot => `
<option value="${Number(slot.id)}">
${esc(slot.slot_code)} - ${esc(slot.zone || "General Zone")}
(${esc(slot.slot_type)})
</option>
`).join("")}
</select>
</div>
<button class="btn btn-dark" type="button"
onclick="submitOwnerBooking()">
Confirm Booking
</button>
</section>`;
}
async function submitOwnerBooking() {
const vehicleSelect = $("#ownerBookingVehicle");
const slotSelect = $("#ownerBookingSlot");
if (!vehicleSelect || !slotSelect) return;
if (!vehicleSelect.value || !slotSelect.value) {
toast("Please select both vehicle and parking slot.", "error");
return;
}
await bookOwnerSlot(vehicleSelect.value, slotSelect.value);
}
function renderOwnerOverview() {
const vehicles = state.ownerBookingData.vehicles;
const slots = state.ownerBookingData.slots;
const sessions = state.ownerBookingData.sessions;
const activeBooking = getOwnerActiveBooking();
const available = getAvailableOwnerSlots().length;
$("#pageContent").innerHTML = `
<div class="welcome-row">
<div>
<div class="section-kicker">OWNER DASHBOARD</div>
<h3>Welcome to ParkNest.</h3>
<p>Manage your vehicle and campus parking booking.</p>
</div>
<div class="actions">
<button class="btn btn-dark" onclick="navigate('parking')">
Book Parking
</button>
</div>
</div>
<div class="stats-grid">
${stat("My Vehicles", vehicles.length, "⌑", "Registered vehicles", "blue")}
${stat("Available Slots", available, "▤", "Currently available")}
${stat("My Active Booking", activeBooking ? 1 : 0, "◉",
activeBooking ? "You have a booking" : "No active booking", "orange")}
${stat("My Parking Records", sessions.length, "▤", "Parking history", "purple")}
</div>
<section class="panel" style="margin-top:18px">
<h3>Quick Actions</h3>
<div class="actions">
<button class="btn btn-dark" onclick="openVehicleModal()">+ Register My Vehicle</button>
<button class="btn" onclick="navigate('vehicles')">My Vehicles</button>
<button class="btn" onclick="navigate('parking')">Parking & Booking</button>
<button class="btn" onclick="navigate('sessions')">My Parking History</button>
</div>
</section>
${renderOwnerBookingPanel()}
`;
}
function renderOverview() {
const dashboard = state.dashboard || {};
const stats = dashboard.stats || {};
if ($("#navOccupied")) $("#navOccupied").textContent = stats.occupied || 0;
const zones = (dashboard.zones || []).map(zone => {
const total = Number(zone.total_slots || 0);
const occupied = Number(zone.occupied || 0);
const percent = total ? Math.round(occupied / total * 100) : 0;
return `
<div class="zone-row">
<div>
<div class="zone-name">${esc(zone.name)}</div>
<div class="zone-meta">
${occupied} occupied · ${Math.max(0, total - occupied)} available
</div>
</div>
<div class="zone-count">${percent}%</div>
<div class="progress">
<span class="${percent >= 85 ? "high" : ""}" style="width:${percent}%"></span>
</div>
</div>`;
}).join("");
const slots = state.slots.slice(0, 12).map(slot => `
<button class="slot ${slot.session_id ? "occupied" : "available"}"
title="${esc(slot.zone)}" onclick="navigate('parking')">
${esc(slot.slot_code)}
<small>${slot.session_id ? "Busy" : "Free"}</small>
</button>
`).join("");
const recent = (dashboard.recent || []).map(record => `
<tr>
<td><span class="plate">${esc(record.plate_number)}</span></td>
<td>${esc(record.slot_code)}</td>
<td>${dateTime(record.entry_time)}</td>
<td>
<span class="status status-${esc(record.status)}">
${record.status === "active" ? "Parked" : "Completed"}
</span>
</td>
</tr>
`).join("");
const actions = canOperateParking() ? `
<div class="actions">
<button class="btn" onclick="openVehicleModal()">+ Add vehicle</button>
<button class="btn btn-dark" onclick="openEntryModal()">+ Record entry</button>
</div>` : "";
$("#pageContent").innerHTML = `
<div class="welcome-row">
<div>
<div class="section-kicker">YOUR CAMPUS AT A GLANCE</div>
<h3>Everything in its place.</h3>
<p>Here's what's happening across your parking zones today.</p>
</div>
${actions}
</div>
<div class="stats-grid">
${stat("Registered vehicles", stats.vehicles || 0, "⌑", "Vehicle records", "blue")}
${stat("Total parking slots", stats.slots || 0, "▤", "Across all active zones")}
${stat("Currently parked", stats.occupied || 0, "◉",
`${stats.available || 0} spaces available`, "orange")}
${stat("Today's revenue", money(stats.revenue), "৳", "Payments received today", "purple")}
</div>
<div class="dashboard-grid">
<section class="panel">
${panelHead("Zone occupancy", "Parking area usage", "View map", "navigate('parking')")}
<div class="zone-list">
${zones || '<div class="empty-state">No zones configured yet.</div>'}
</div>
<div style="height:1px;background:var(--line);margin:22px 0 17px"></div>
<div class="slot-legend">
<span><i class="legend-dot green-dot"></i>Available</span>
<span><i class="legend-dot red-dot"></i>Occupied</span>
<span><i class="legend-dot gray-dot"></i>Inactive</span>
</div>
<div class="mini-slots">
${slots || '<div class="empty-state">No parking slots yet.</div>'}
</div>
</section>
<section class="panel">
${panelHead("Recent activity", "Latest vehicle movements", "Full history", "navigate('sessions')")}
<div class="table-wrap">
<table>
<thead>
<tr><th>VEHICLE</th><th>SLOT</th><th>ENTRY</th><th>STATUS</th></tr>
</thead>
<tbody>
${recent || '<tr><td colspan="4" class="empty-state">No parking activity yet.</td></tr>'}
</tbody>
</table>
</div>
</section>
</div>`;
}
function renderParking() {
const zones = [...new Set(state.slots.map(slot => slot.zone).filter(Boolean))];
if ($("#navOccupied")) {
$("#navOccupied").textContent =
state.slots.filter(slot => slot.session_id).length;
}
const entryButton = canOperateParking()
? '<button class="btn btn-dark" onclick="openEntryModal()">+ Record entry</button>'
: "";
$("#pageContent").innerHTML = `
${renderOwnerBookingPanel()}
<div class="welcome-row">
<div>
<div class="section-kicker">LIVE SLOT AVAILABILITY</div>
<h3>Find your next open space.</h3>
<p>
${canOperateParking()
? "Select a free slot to record entry or an occupied slot to record exit."
: "Check which parking spaces are currently available."}
</p>
</div>
<div class="actions">${entryButton}</div>
</div>
<div class="panel" style="margin-bottom:18px">
<div class="slot-legend">
<span><i class="legend-dot green-dot"></i>Available</span>
<span><i class="legend-dot red-dot"></i>Occupied</span>
<span>Live slot status</span>
</div>
</div>
${zones.map(zone => {
const list = state.slots.filter(slot => slot.zone === zone);
return `
<section class="panel" style="margin-bottom:16px">
${panelHead(
esc(zone),
`${list.filter(slot => !slot.session_id).length} available of ${list.length} slots`
)}
<div class="mini-slots" style="grid-template-columns:repeat(auto-fill,minmax(76px,1fr))">
${list.map(slot => `
<button class="slot ${slot.session_id ? "occupied" : "available"}"
onclick="slotAction(${Number(slot.id)})"
title="${slot.session_id ? "Occupied" : "Available"}">
${esc(slot.slot_code)}
<small>
${slot.session_id
? esc(slot.plate_number || "Busy")
: "Available"}
</small>
</button>
`).join("")}
</div>
</section>`;
}).join("") || '<div class="panel empty-state">No parking zones or slots found.</div>'}
`;
}
function renderVehicles() {
    const container = $("#pageContent");
    if (!container) return;

    const vehicles = Array.isArray(state.vehicles)
        ? state.vehicles
        : [];

    const filteredVehicles = vehicles.filter(vehicle => {
        const searchText = (
            (vehicle.plate_number || "") + " " +
            (vehicle.vehicle_type || "") + " " +
            (vehicle.owner_name || "") + " " +
            (vehicle.approval_status || "")
        ).toLowerCase();

        return searchText.includes(
            String(state.filter || "").toLowerCase()
        );
    });

    const vehicleCards = filteredVehicles.map(vehicle => {
        const status = String(
            vehicle.approval_status || "pending"
        ).trim().toLowerCase();

        let action = "";

        if (isAdmin() && status === "pending") {
            action = `
                <div class="actions">
                    <button class="btn btn-dark"
                        onclick="updateVehicleApproval(${Number(vehicle.id)}, 'approved')">
                        Approve
                    </button>

                    <button class="btn"
                        onclick="updateVehicleApproval(${Number(vehicle.id)}, 'rejected')">
                        Reject
                    </button>
                </div>
            `;
        } else {
            action = `
                <span class="status-badge">
                    ${esc(status)}
                </span>
            `;
        }

        return `
            <div class="vehicle-card">
                <h3>${esc(vehicle.plate_number || "N/A")}</h3>
                <p>Vehicle Type: ${esc(vehicle.vehicle_type || "N/A")}</p>
                <p>Owner: ${esc(vehicle.owner_name || "N/A")}</p>
                <p>Status: ${esc(status)}</p>
                ${action}
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="welcome-row">
            <div>
                <div class="section-kicker">VEHICLE DIRECTORY</div>
                <h3>Vehicle Management</h3>
                <p>View and manage registered campus vehicles.</p>
            </div>

            <div class="actions">
                <button class="btn btn-dark"
                    onclick="openVehicleModal()">
                    + Register Vehicle
                </button>
            </div>
        </div>

        <section class="panel">
            <div class="panel-head">
                <div>
                    <h4 class="panel-title">Registered Vehicles</h4>
                    <div class="panel-subtitle">
                        ${vehicles.length} total vehicles
                    </div>
                </div>
            </div>

            <div class="search-row">
                <div class="search-box">
                    <span>⌕</span>
                    <input
                        id="tableSearch"
                        placeholder="Search vehicle..."
                        value="${esc(state.filter)}"
                        oninput="setFilter(this.value, 'vehicles')">
                </div>
            </div>

            <div class="vehicle-list">
                ${
                    vehicleCards ||
                    '<div class="empty-state">No vehicles found.</div>'
                }
            </div>
        </section>
    `;
}


async function updateVehicleApproval(id, status) {
    if (!isAdmin()) {
        alert("Only Admin can approve or reject vehicles.");
        return;
    }

    if (!["approved", "rejected"].includes(status)) {
        return;
    }

    const confirmed = confirm(
        `Are you sure you want to ${status} this vehicle?`
    );

    if (!confirmed) return;

    try {
        await api(`/api/admin/vehicles/${id}/approval`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });

        alert(`Vehicle ${status} successfully!`);

        state.vehicles = await api("/api/vehicles");
        renderVehicles();

    } catch (error) {
        alert(error.message || "Could not update vehicle status.");
    }
}

window.updateVehicleApproval = updateVehicleApproval;

async function updateVehicleApproval(vehicleId, status) {
if (!isAdmin()) {
toast("Only Admin can approve or reject vehicles.", "error");
return;
}
if (!["approved", "rejected"].includes(status)) return;
const actionText = status === "approved" ? "approve" : "reject";
if (!confirm(`Are you sure you want to ${actionText} this vehicle?`)) return;
try {
const result = await api(`/api/admin/vehicles/${Number(vehicleId)}/approval`, {
method: "PATCH",
body: JSON.stringify({ status })
});
toast(result.message || `Vehicle ${status} successfully.`);
state.vehicles = await api("/api/vehicles");
renderVehicles();
} catch (error) {
toast(error.message, "error");
}
}
function setFilter(value, kind) {
state.filter = value;
const position = $("#tableSearch")?.selectionStart;
if (kind === "vehicles") renderVehicles();
if (kind === "sessions") renderSessions();
if (kind === "payments") renderPayments();
if (kind === "violations") renderViolations();
const input = $("#tableSearch");
if (input) {
input.focus();
input.setSelectionRange(position ?? value.length, position ?? value.length);
}
}
function renderSessions() {
const rows = state.sessions.filter(record =>
(
(record.plate_number || "") + " " +
(record.slot_code || "") + " " +
(record.zone || "") + " " +
(record.status || "")
).toLowerCase().includes(state.filter.toLowerCase())
).map(record => `
<tr>
<td><span class="plate">${esc(record.plate_number)}</span></td>
<td>${esc(record.slot_code)}</td>
<td>${esc(record.zone)}</td>
<td>${dateTime(record.entry_time)}</td>
<td>${record.exit_time ? dateTime(record.exit_time) : "—"}</td>
<td>
${record.status === "active"
? '<span class="status status-active">Parked</span>'
: '<span class="status status-completed">Completed</span>'}
</td>
<td>
${money(record.fee)}
${record.status === "active" && canOperateParking()
? `<button class="btn" style="margin-left:8px"
onclick="exitSession(${Number(record.id)},'${esc(record.plate_number)}')">Exit</button>`
: ""}
</td>
</tr>
`).join("");
const entryButton = canOperateParking()
? '<button class="btn btn-dark" onclick="openEntryModal()">+ Record entry</button>'
: "";
$("#pageContent").innerHTML = `
<div class="welcome-row">
<div>
<div class="section-kicker">VEHICLE MOVEMENT LOG</div>
<h3>A clear record of every visit.</h3>
<p>Track arrival, departure, duration and parking fees.</p>
</div>
<div class="actions">${entryButton}</div>
</div>
<section class="panel">
${panelHead("Parking sessions", `${state.sessions.length} recent records`)}
<div class="search-row">
<div class="search-box">
<span>⌕</span>
<input id="tableSearch"
placeholder="Search plate, slot or zone…"
value="${esc(state.filter)}"
oninput="setFilter(this.value,'sessions')">
</div>
<button class="btn" onclick="downloadCsv('sessions')">↓ Export CSV</button>
</div>
<div class="table-wrap">
<table>
<thead>
<tr>
<th>VEHICLE</th><th>SLOT</th><th>ZONE</th>
<th>ENTRY</th><th>EXIT</th><th>STATUS</th><th>FEE / ACTION</th>
</tr>
</thead>
<tbody>
${rows || '<tr><td colspan="7"><div class="empty-state">No parking sessions yet.</div></td></tr>'}
</tbody>
</table>
</div>
</section>`;
}
function renderPayments() {
const filtered = state.payments.filter(record =>
(
(record.plate_number || "") + " " +
(record.method || "") + " " +
(record.status || "")
).toLowerCase().includes(state.filter.toLowerCase())
);
const rows = filtered.map(record => `
<tr>
<td>#${record.id}</td>
<td><span class="plate">${esc(record.plate_number)}</span></td>
<td>${money(record.amount)}</td>
<td>${esc((record.method || "").replace("_", " "))}</td>
<td><span class="status status-${esc(record.status)}">${esc(record.status)}</span></td>
<td>${dateTime(record.paid_at)}</td>
</tr>
`).join("");
const total = state.payments
.filter(payment => payment.status === "paid")
.reduce((sum, payment) => sum + Number(payment.amount), 0);
$("#pageContent").innerHTML = `
<div class="welcome-row">
<div>
<div class="section-kicker">PAYMENT REGISTER</div>
<h3>Every payment, easy to trace.</h3>
<p>Parking fees are calculated and recorded when a vehicle exits.</p>
</div>
<div class="actions">
<button class="btn" onclick="downloadCsv('payments')">↓ Export CSV</button>
</div>
</div>
<div class="stats-grid">
${stat("Payment records", state.payments.length, "▤", "Loaded transactions")}
${stat("Recorded paid total", money(total), "৳", "Across loaded records", "purple")}
${stat("Cash payments", state.payments.filter(p => p.method === "cash").length, "＄", "Paid in cash", "orange")}
${stat("Mobile banking", state.payments.filter(p => p.method === "mobile_banking").length, "⌁", "Mobile payment records", "blue")}
</div>
<section class="panel">
${panelHead("Transactions", `${state.payments.length} recent payment records`)}
<div class="search-row">
<div class="search-box">
<span>⌕</span>
<input id="tableSearch"
placeholder="Search plate or method…"
value="${esc(state.filter)}"
oninput="setFilter(this.value,'payments')">
</div>
</div>
<div class="table-wrap">
<table>
<thead>
<tr><th>PAYMENT ID</th><th>VEHICLE</th><th>AMOUNT</th><th>METHOD</th><th>STATUS</th><th>PAID AT</th></tr>
</thead>
<tbody>
${rows || '<tr><td colspan="6"><div class="empty-state">No payments recorded.</div></td></tr>'}
</tbody>
</table>
</div>
</section>`;
}
function renderViolations() {
const rows = state.violations.filter(record =>
(
(record.plate_number || "") + " " +
(record.description || "") + " " +
(record.status || "")
).toLowerCase().includes(state.filter.toLowerCase())
).map(record => `
<tr>
<td><span class="plate">${esc(record.plate_number)}</span></td>
<td>${esc(record.description)}</td>
<td>${esc(record.slot_code || "—")}</td>
<td>${money(record.fine_amount)}</td>
<td>
<span class="status status-${record.status === "open" ? "pending" : "resolved"}">
${esc(record.status)}
</span>
</td>
<td>${dateTime(record.recorded_at)}</td>
</tr>
`).join("");
const addButton = canOperateParking()
? '<button class="btn btn-dark" onclick="openViolationModal()">+ Record violation</button>'
: "";
$("#pageContent").innerHTML = `
<div class="welcome-row">
<div>
<div class="section-kicker">CAMPUS PARKING RULES</div>
<h3>Keep things fair and safe.</h3>
<p>Review parking violations and their current status.</p>
</div>
<div class="actions">${addButton}</div>
</div>
<section class="panel">
${panelHead("Violation register", `${state.violations.length} recent records`)}
<div class="search-row">
<div class="search-box">
<span>⌕</span>
<input id="tableSearch"
placeholder="Search plate or violation…"
value="${esc(state.filter)}"
oninput="setFilter(this.value,'violations')">
</div>
<button class="btn" onclick="downloadCsv('violations')">↓ Export CSV</button>
</div>
<div class="table-wrap">
<table>
<thead>
<tr><th>VEHICLE</th><th>DESCRIPTION</th><th>SLOT</th><th>FINE</th><th>STATUS</th><th>RECORDED</th></tr>
</thead>
<tbody>
${rows || '<tr><td colspan="6"><div class="empty-state">No violations recorded.</div></td></tr>'}
</tbody>
</table>
</div>
</section>`;
}
function renderReports(data) {
const daily = data.daily || [];
const max = Math.max(1, ...daily.map(item => Number(item.revenue)));
const bars = daily.map(item => `
<div class="bar-col">
<span class="bar-value">${Number(item.revenue) > 0 ? money(item.revenue) : "—"}</span>
<div class="bar"
style="height:${Math.max(3, Number(item.revenue) / max * 100)}%"
title="${money(item.revenue)}"></div>
<span class="bar-label">
${new Date(item.day).toLocaleDateString("en", { weekday: "short" })}
</span>
</div>
`).join("");
const zones = (data.zones || []).map(zone => `
<tr>
<td><strong>${esc(zone.name)}</strong></td>
<td>${zone.sessions}</td>
<td>${money(zone.revenue)}</td>
</tr>
`).join("");
$("#pageContent").innerHTML = `
<div class="welcome-row">
<div>
<div class="section-kicker">CAMPUS OPERATIONS INSIGHTS</div>
<h3>Make the next decision smarter.</h3>
<p>Recent payment trends and zone-level activity from your database.</p>
</div>
<div class="actions">
<button class="btn" onclick="downloadCsv('payments')">↓ Export payments</button>
</div>
</div>
<div class="report-grid">
<section class="panel">
${panelHead("Revenue trend", "Paid parking fees · last 7 days")}
<div class="bar-chart">
${bars || '<div class="empty-state">No revenue data yet.</div>'}
</div>
</section>
<section class="panel">
${panelHead("Zone performance", "Completed parking sessions by zone")}
<div class="table-wrap">
<table>
<thead><tr><th>ZONE</th><th>SESSIONS</th><th>REVENUE</th></tr></thead>
<tbody>${zones || '<tr><td colspan="3">No zone data yet.</td></tr>'}</tbody>
</table>
</div>
</section>
</div>
`;
}
function renderGuardRequests(requests) {
const rows = (requests || []).map(guard => `
<tr>
<td><strong>${esc(guard.name || guard.full_name || "Unknown")}</strong></td>
<td>${esc(guard.email)}</td>
<td>${esc(guard.phone || "—")}</td>
<td>${esc(guard.assigned_gate || "—")}</td>
<td><span class="status status-pending">Pending</span></td>
<td>
<div class="actions">
<button class="btn btn-dark"
data-guard-id="${Number(guard.id)}"
data-guard-status="approved">Approve</button>
<button class="btn"
data-guard-id="${Number(guard.id)}"
data-guard-status="rejected">Reject</button>
</div>
</td>
</tr>
`).join("");
$("#pageContent").innerHTML = `
<div class="welcome-row">
<div>
<div class="section-kicker">ADMINISTRATION</div>
<h3>Guard Applications</h3>
<p>Review and approve new Guard registrations.</p>
</div>
</div>
<section class="panel">
${panelHead("Pending applications", `${(requests || []).length} applications waiting for approval`)}
<div class="table-wrap">
<table>
<thead>
<tr><th>NAME</th><th>EMAIL</th><th>PHONE</th><th>ASSIGNED GATE</th><th>STATUS</th><th>ACTION</th></tr>
</thead>
<tbody>
${rows || '<tr><td colspan="6"><div class="empty-state">No pending Guard applications.</div></td></tr>'}
</tbody>
</table>
</div>
</section>
`;
$$("#pageContent [data-guard-id]").forEach(button => {
button.addEventListener("click", async () => {
const guardId = button.dataset.guardId;
const status = button.dataset.guardStatus;
const action = status === "approved" ? "approve" : "reject";
if (!confirm(`Are you sure you want to ${action} this Guard application?`)) {
return;
}
button.disabled = true;
try {
const result = await api(
`/api/admin/guard-requests/${guardId}`,
{
method: "PATCH",
body: JSON.stringify({ status })
}
);
toast(result.message || `Guard application ${status}.`);
state.guardRequests = await api("/api/admin/guard-requests");
renderGuardRequests(state.guardRequests);
} catch (error) {
toast(error.message, "error");
button.disabled = false;
}
});
});
}
function openModal(title, subtitle, body) {
if ($("#modalEyebrow")) $("#modalEyebrow").textContent = subtitle || "PARKNEST WORKSPACE";
if ($("#modalTitle")) $("#modalTitle").textContent = title;
if ($("#modalBody")) $("#modalBody").innerHTML = body;
const modal = $("#modal");
if (modal && typeof modal.showModal === "function") {
modal.showModal();
}
}
function closeModal() {
const modal = $("#modal");
if (modal?.open) modal.close();
}
function openVehicleModal() {
if (!canManageVehicles() && !isOwner()) {
toast("You do not have permission to register vehicles.", "error");
return;
}
const ownerMode = isOwner();
openModal(
ownerMode ? "Register My Vehicle" : "Register a Vehicle",
"VEHICLE DIRECTORY",
`
<form id="vehicleForm" class="modal-form">
<div class="form-grid">
<label class="field-label">
Plate Number *
<input class="field-input" name="plate_number"
placeholder="e.g. DHAKA-METRO-1234" required>
</label>
<label class="field-label">
Vehicle Type *
<select class="field-select" name="vehicle_type" required>
<option value="Car">Car</option>
<option value="Motorcycle">Motorcycle</option>
<option value="Bicycle">Bicycle</option>
<option value="Other">Other</option>
</select>
</label>
<label class="field-label">
Make / Model
<input class="field-input" name="make_model"
placeholder="e.g. Toyota Axio">
</label>
<label class="field-label">
Colour
<input class="field-input" name="color"
placeholder="e.g. Silver">
</label>
${ownerMode ? `
<div class="role-note">
Your vehicle will automatically be linked to your logged-in Owner account.
</div>
` : `
<label class="field-label">
Owner Full Name *
<input class="field-input" name="owner_name"
placeholder="Student or staff name" required>
</label>
<label class="field-label">
Owner Email *
<input class="field-input" name="owner_email"
type="email" placeholder="owner@university.edu" required>
</label>
`}
</div>
<div class="modal-actions">
<button type="button" class="btn" onclick="closeModal()">Cancel</button>
<button class="btn btn-dark" type="submit">Register Vehicle</button>
</div>
</form>
`
);
$("#vehicleForm")?.addEventListener("submit", async event => {
event.preventDefault();
const button = event.submitter;
if (button) button.disabled = true;
try {
const payload = Object.fromEntries(new FormData(event.target));
payload.plate_number = payload.plate_number.trim().toUpperCase();
if (ownerMode) {
delete payload.owner_name;
delete payload.owner_email;
}
const registrationResult = await api("/api/vehicles", {
method: "POST",
body: JSON.stringify(payload)
});
closeModal();
toast(registrationResult.message || "Vehicle registered successfully.");
state.filter = "";
if (ownerMode) {
await loadOwnerBookingData();
state.vehicles = state.ownerBookingData.vehicles;
await navigate("vehicles");
} else {
state.vehicles = await api("/api/vehicles");
await navigate("vehicles");
}
} catch (error) {
toast(error.message, "error");
} finally {
if (button) button.disabled = false;
}
});
}
function openEntryModal(slotId = "") {
if (!canOperateParking()) {
toast("Only Admin and Guard can record vehicle entry.", "error");
return;
}
const freeSlots = state.slots.filter(slot => !slot.session_id);
const options = freeSlots.map(slot => `
<option value="${Number(slot.id)}"
${String(slot.id) === String(slotId) ? "selected" : ""}>
${esc(slot.slot_code)} · ${esc(slot.zone)} (${esc(slot.slot_type)})
</option>
`).join("");
openModal(
"Record Vehicle Entry",
"PARKING OPERATIONS",
`
<form id="entryForm" class="modal-form">
<div class="role-note">Choose a registered vehicle and a free slot.</div>
<label class="field-label">
Vehicle Plate Number *
<input class="field-input" name="plate_number"
placeholder="Enter registered plate number"
required style="text-transform:uppercase">
</label>
<label class="field-label">
Available Parking Slot *
<select class="field-select" name="slot_id" required style="width:100%">
<option value="">Choose a free slot</option>
${options}
</select>
</label>
<div class="modal-actions">
<button type="button" class="btn" onclick="closeModal()">Cancel</button>
<button class="btn btn-dark" type="submit"
${freeSlots.length ? "" : "disabled"}>Confirm Entry</button>
</div>
</form>
`
);
$("#entryForm")?.addEventListener("submit", async event => {
event.preventDefault();
const button = event.submitter;
if (button) button.disabled = true;
try {
const payload = Object.fromEntries(new FormData(event.target));
payload.slot_id = Number(payload.slot_id);
await api("/api/sessions/entry", {
method: "POST",
body: JSON.stringify(payload)
});
closeModal();
toast("Vehicle entry recorded.");
await navigate(state.page === "parking" ? "parking" : "overview");
} catch (error) {
toast(error.message, "error");
} finally {
if (button) button.disabled = false;
}
});
}
function slotAction(id) {
const slot = state.slots.find(item => String(item.id) === String(id));
if (!slot) {
toast("Parking slot not found. Please refresh the page.", "error");
return;
}
if (!canOperateParking()) {
toast("You can view slot availability. Ask the parking operator to record entry or exit.", "error");
return;
}
if (!slot.session_id) {
openEntryModal(slot.id);
return;
}
openExitForm(slot.session_id, slot.plate_number, slot.slot_code, slot.zone);
}
function openExitForm(sessionId, plate, slotCode = "", zone = "") {
openModal(
"Record Vehicle Exit",
"PARKING OPERATIONS",
`
<div class="role-note">
<strong>${esc(plate)}</strong>
${slotCode ? `is parked in <strong>${esc(slotCode)}</strong>, ${esc(zone)}.` : ""}
</div>
<form id="exitForm" class="modal-form">
<label class="field-label">
Payment Method
<select class="field-select" name="method" style="width:100%">
<option value="cash">Cash</option>
<option value="card">Card</option>
<option value="mobile_banking">Mobile Banking</option>
<option value="waived">Waived</option>
</select>
</label>
<div class="modal-actions">
<button type="button" class="btn" onclick="closeModal()">Cancel</button>
<button class="btn btn-dark" type="submit">Record Exit</button>
</div>
</form>
`
);
$("#exitForm")?.addEventListener("submit", async event => {
event.preventDefault();
const button = event.submitter;
if (button) button.disabled = true;
try {
const payload = Object.fromEntries(new FormData(event.target));
const result = await api(`/api/sessions/${Number(sessionId)}/exit`, {
method: "POST",
body: JSON.stringify(payload)
});
closeModal();
toast(`Exit recorded · fee ${money(result.fee)}`);
await navigate("parking");
} catch (error) {
toast(error.message, "error");
} finally {
if (button) button.disabled = false;
}
});
}
async function exitSession(id, plate) {
if (!canOperateParking()) {
toast("Only Admin and Guard can record vehicle exit.", "error");
return;
}
openExitForm(id, plate);
}
function openViolationModal() {
if (!canOperateParking()) {
toast("Only Admin and Guard can record violations.", "error");
return;
}
openModal(
"Record a Violation",
"CAMPUS PARKING RULES",
`
<form id="violationForm" class="modal-form">
<label class="field-label">
Vehicle Plate Number *
<input class="field-input" name="plate_number"
placeholder="Registered plate number" required>
</label>
<label class="field-label">
Parking Slot (Optional)
<select class="field-select" name="slot_id" style="width:100%">
<option value="">Not applicable</option>
${state.slots.map(slot => `
<option value="${Number(slot.id)}">
${esc(slot.slot_code)} · ${esc(slot.zone)}
</option>
`).join("")}
</select>
</label>
<label class="field-label">
Violation Details *
<textarea class="field-textarea" name="description"
rows="3" placeholder="Describe the parking rule violation"
required></textarea>
</label>
<label class="field-label">
Fine Amount (৳)
<input class="field-input" name="fine_amount"
type="number" min="0" step="1" value="0" required>
</label>
<div class="modal-actions">
<button type="button" class="btn" onclick="closeModal()">Cancel</button>
<button class="btn btn-dark" type="submit">Save Violation</button>
</div>
</form>
`
);
$("#violationForm")?.addEventListener("submit", async event => {
event.preventDefault();
const button = event.submitter;
if (button) button.disabled = true;
try {
const payload = Object.fromEntries(new FormData(event.target));
payload.fine_amount = Number(payload.fine_amount);
payload.slot_id = payload.slot_id ? Number(payload.slot_id) : null;
await api("/api/violations", {
method: "POST",
body: JSON.stringify(payload)
});
closeModal();
toast("Violation saved.");
await navigate("violations");
} catch (error) {
toast(error.message, "error");
} finally {
if (button) button.disabled = false;
}
});
}
async function deleteVehicle(id, plate) {
if (!isAdmin()) {
toast("Only administrators can remove vehicles.", "error");
return;
}
if (!confirm(`Remove vehicle ${plate}? This action cannot be undone.`)) {
return;
}
try {
await api(`/api/vehicles/${Number(id)}`, {
method: "DELETE"
});
toast("Vehicle removed.");
state.vehicles = await api("/api/vehicles");
renderVehicles();
} catch (error) {
toast(error.message, "error");
}
}
function openHelp() {
openModal(
"A Quick Guide",
"GETTING STARTED",
`
<div class="help-content">
<p>Welcome to ParkNest. Here is the easiest way to get started:</p>
<ol>
<li><strong>Owner:</strong> Register your account and add your own vehicle.</li>
<li><strong>Book Parking:</strong> Select your vehicle and an available slot.</li>
<li><strong>Release Booking:</strong> Release your active parking booking when needed.</li>
<li><strong>Admin/Guard:</strong> Register vehicles and manage vehicle entry and exit.</li>
<li><strong>Guard Approval:</strong> Admin must approve new Guard applications.</li>
<li><strong>Reports:</strong> Administrators can view revenue and zone performance.</li>
</ol>
<div class="modal-actions">
<button class="btn btn-dark" onclick="closeModal()">Got it</button>
</div>
</div>
`
);
}
function downloadCsv(kind) {
const data = {
sessions: state.sessions,
payments: state.payments,
violations: state.violations
};
const rows = data[kind] || [];
if (!rows.length) {
toast("There are no records to export yet.", "error");
return;
}
const columns = Object.keys(rows[0]);
const csv = [
columns.join(","),
...rows.map(row =>
columns.map(column =>
'"' + String(row[column] ?? "").replace(/"/g, '""') + '"'
).join(",")
)
].join("\r\n");
const blob = new Blob(["\ufeff" + csv], {
type: "text/csv;charset=utf-8;"
});
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = `parknest-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
link.click();
URL.revokeObjectURL(url);
toast("CSV export prepared.");
}
window.navigate = navigate;
window.openVehicleModal = openVehicleModal;
window.openEntryModal = openEntryModal;
window.slotAction = slotAction;
window.exitSession = exitSession;
window.openViolationModal = openViolationModal;
window.deleteVehicle = deleteVehicle;
window.closeModal = closeModal;
window.setFilter = setFilter;
window.downloadCsv = downloadCsv;
window.submitOwnerBooking = submitOwnerBooking;
window.bookOwnerSlot = bookOwnerSlot;
window.releaseOwnerBooking = releaseOwnerBooking;
(async function initializeParkNest() {
try {
const response = await fetch("/api/health");
if (!response.ok) {
toast("Backend health check failed. Check the server.", "error");
}
} catch (error) {
toast("Cannot connect to ParkNest server. Start the backend first.", "error");
}
updateGuardFields();
if (state.token && state.user) {
try {
const current = await api("/api/me");
state.user = current.user || current;
localStorage.setItem(
"parknest_user",
JSON.stringify(state.user)
);
showApp();
} catch (error) {
state.token = "";
state.user = null;
localStorage.removeItem("parknest_token");
localStorage.removeItem("parknest_user");
showAuth();
}
} else {
showAuth();
}
})();
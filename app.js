const searchRadiusMeters = 1500;
const overpassEndpoint = "https://overpass-api.de/api/interpreter";
const cafes = [];

const grid = document.querySelector("#cafe-grid");
const searchInput = document.querySelector("#search-input");
const searchForm = document.querySelector("#search-form");
const mapsSearchLink = document.querySelector("#maps-search-link");
const locationButton = document.querySelector("#location-button");
const locationStatus = document.querySelector("#location-status");
const sortSelect = document.querySelector("#sort-select");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyMessage = document.querySelector("#empty-message");
const emptyAction = document.querySelector("#empty-action");
const savedCount = document.querySelector("#saved-count");
const filterButtons = [...document.querySelectorAll(".filter-chip")];
const clearButton = document.querySelector("#clear-filters");

const savedCafes = new Set(readSavedCafes());
let activeFilter = "all";
let userLocation = null;
let loading = false;

function readSavedCafes() {
  try {
    const saved = JSON.parse(localStorage.getItem("little-cup-saved") || "[]");
    return Array.isArray(saved)
      ? saved.filter((id) => typeof id === "string" && id.startsWith("osm-"))
      : [];
  } catch (error) {
    console.error("Could not read saved cafes from local storage.", error);
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem("little-cup-saved", JSON.stringify([...savedCafes]));
  } catch (error) {
    console.error("Could not save favorite cafes to local storage.", error);
  }
}

function updateMapsSearchLink() {
  const searchTerm = searchInput.value.trim();
  const place = userLocation
    ? `${userLocation.latitude}, ${userLocation.longitude}`
    : "me";
  const query = searchTerm
    ? `${searchTerm} cafes near ${place}`
    : `cafes near ${place}`;
  const mapsUrl = new URL("https://www.google.com/maps/search/");
  mapsUrl.searchParams.set("api", "1");
  mapsUrl.searchParams.set("query", query);
  mapsSearchLink.href = mapsUrl.toString();
}

function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function distanceBetween(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(lat2 - lat1);
  const longitudeDelta = radians(lon2 - lon1);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function getCafeCoordinates(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }
  return { latitude, longitude };
}

function getAddress(tags) {
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  return (
    street ||
    tags["addr:suburb"] ||
    tags["addr:neighbourhood"] ||
    tags["addr:city"] ||
    ""
  );
}

function convertOverpassElement(element, origin) {
  const tags = element.tags || {};
  const coordinates = getCafeCoordinates(element);
  if (!coordinates || !tags.name) {
    return null;
  }

  const id = `osm-${element.type}-${element.id}`;
  const googleMapsUrl = new URL("https://www.google.com/maps/search/");
  googleMapsUrl.searchParams.set("api", "1");
  googleMapsUrl.searchParams.set(
    "query",
    `${tags.name} ${coordinates.latitude},${coordinates.longitude}`,
  );

  return {
    id,
    name: tags.name,
    address: getAddress(tags),
    cuisine: tags.cuisine
      ? tags.cuisine.split(";").map((item) => item.trim()).filter(Boolean).slice(0, 2)
      : [],
    openingHours: tags.opening_hours || "",
    distance: distanceBetween(
      origin.latitude,
      origin.longitude,
      coordinates.latitude,
      coordinates.longitude,
    ),
    googleMapsUrl: googleMapsUrl.toString(),
  };
}

function createCafeCard(cafe) {
  const isSaved = savedCafes.has(cafe.id);
  const card = document.createElement("article");
  card.className = "cafe-card";

  const image = document.createElement("div");
  image.className = "card-image";
  image.setAttribute("aria-label", `${cafe.name} cafe`);

  const illustration = document.createElement("span");
  illustration.className = "cafe-illustration";
  illustration.setAttribute("aria-hidden", "true");
  illustration.textContent = "☕";

  const favoriteButton = document.createElement("button");
  favoriteButton.className = `favorite-button${isSaved ? " saved" : ""}`;
  favoriteButton.type = "button";
  favoriteButton.setAttribute("aria-pressed", String(isSaved));
  favoriteButton.setAttribute(
    "aria-label",
    `${isSaved ? "Remove" : "Save"} ${cafe.name} ${isSaved ? "from" : "to"} favorites`,
  );
  favoriteButton.textContent = isSaved ? "♥" : "♡";
  favoriteButton.addEventListener("click", () => {
    if (savedCafes.has(cafe.id)) {
      savedCafes.delete(cafe.id);
    } else {
      savedCafes.add(cafe.id);
    }
    saveFavorites();
    renderCafes();
  });

  image.append(illustration, favoriteButton);

  const info = document.createElement("div");
  info.className = "cafe-info";
  const heading = document.createElement("div");
  heading.className = "cafe-heading";

  const name = document.createElement("h3");
  name.textContent = cafe.name;
  heading.append(name);

  const location = document.createElement("p");
  location.className = "cafe-location";
  location.textContent = cafe.address || "Address not listed";

  const tags = document.createElement("div");
  tags.className = "cafe-tags";
  const cafeTags = cafe.cuisine.length ? cafe.cuisine : ["Cafe"];
  for (const tag of cafeTags) {
    const tagElement = document.createElement("span");
    tagElement.className = "cafe-tag";
    tagElement.textContent = tag;
    tags.append(tagElement);
  }

  const mapLink = document.createElement("a");
  mapLink.className = "cafe-map-link";
  mapLink.href = cafe.googleMapsUrl;
  mapLink.target = "_blank";
  mapLink.rel = "noopener noreferrer";
  mapLink.textContent = "View on Google Maps ↗";

  const divider = document.createElement("div");
  divider.className = "card-divider";

  const bottom = document.createElement("div");
  bottom.className = "cafe-bottom";
  const hours = document.createElement("span");
  hours.className = "cafe-hours";
  hours.textContent = cafe.openingHours ? "Hours listed" : "Hours not listed";
  if (cafe.openingHours) {
    hours.title = cafe.openingHours;
  }
  const distance = document.createElement("strong");
  distance.textContent = formatDistance(cafe.distance);
  bottom.append(hours, distance);

  info.append(heading, location, tags, mapLink, divider, bottom);
  card.append(image, info);
  return card;
}

function getVisibleCafes() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  let visibleCafes = cafes.filter((cafe) => {
    const matchesSearch =
      !searchTerm ||
      [cafe.name, cafe.address, ...cafe.cuisine, cafe.openingHours]
        .join(" ")
        .toLowerCase()
        .includes(searchTerm);
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "favorites" && savedCafes.has(cafe.id));
    return matchesSearch && matchesFilter;
  });

  if (sortSelect.value === "name") {
    visibleCafes = [...visibleCafes].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    visibleCafes = [...visibleCafes].sort((a, b) => a.distance - b.distance);
  }

  return visibleCafes;
}

function renderCafes() {
  const visibleCafes = getVisibleCafes();
  grid.replaceChildren(...visibleCafes.map(createCafeCard));
  resultsCount.textContent = userLocation
    ? `Showing ${visibleCafes.length} of ${cafes.length} nearby ${cafes.length === 1 ? "cafe" : "cafes"}`
    : "Share your location to find nearby cafes.";
  emptyState.hidden = visibleCafes.length > 0;
  savedCount.textContent = String(savedCafes.size);

  if (loading) {
    emptyTitle.textContent = "Finding cafes nearby…";
    emptyMessage.textContent = "Searching OpenStreetMap around your location.";
    emptyAction.hidden = true;
  } else if (!userLocation) {
    emptyTitle.textContent = "Find real cafes near you";
    emptyMessage.textContent =
      "Allow location access to search OpenStreetMap for cafes within 1.5 km. No sample places are shown.";
    emptyAction.hidden = false;
  } else if (visibleCafes.length === 0 && cafes.length > 0) {
    emptyTitle.textContent = "No matching cafes";
    emptyMessage.textContent = "Try another search or clear the filters to see nearby cafes.";
    emptyAction.hidden = true;
  } else {
    emptyTitle.textContent = "No cafes found nearby";
    emptyMessage.textContent =
      "OpenStreetMap has no named cafes within 1.5 km. Try again somewhere else or check Google Maps.";
    emptyAction.hidden = false;
  }
}

function setActiveFilter(filter) {
  activeFilter = filter;
  for (const button of filterButtons) {
    const isSelected = button.dataset.filter === filter;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }
  renderCafes();
}

function clearFilters() {
  searchInput.value = "";
  sortSelect.value = "distance";
  setActiveFilter("all");
  updateMapsSearchLink();
  searchInput.focus();
}

function getLocationError(error) {
  if (error.code === 1) {
    return "Location permission was denied. Allow location access in your browser and try again.";
  }
  if (error.code === 2) {
    return "Your location could not be determined. Check that location services are enabled and try again.";
  }
  if (error.code === 3) {
    return "Getting your location timed out. Please try again.";
  }
  return "Could not get your location. Please try again.";
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 15_000,
    });
  });
}

async function findNearbyCafes() {
  if (!navigator.geolocation) {
    locationStatus.textContent =
      "This browser does not support location. Use the Google Maps search instead.";
    return;
  }
  if (!window.isSecureContext) {
    locationStatus.textContent =
      "Location requires a secure page. Run the app on localhost or HTTPS, then try again.";
    return;
  }

  loading = true;
  locationButton.disabled = true;
  locationButton.textContent = "Finding nearby cafes...";
  locationStatus.textContent =
    "Getting your location, then searching OpenStreetMap. Your coordinates will be sent to its public search service.";
  renderCafes();

  try {
    const position = await getCurrentPosition();
    userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    updateMapsSearchLink();

    const query = [
      "[out:json][timeout:20];",
      "(",
      `nwr(around:${searchRadiusMeters},${userLocation.latitude},${userLocation.longitude})["amenity"="cafe"]["name"];`,
      `nwr(around:${searchRadiusMeters},${userLocation.latitude},${userLocation.longitude})["shop"="coffee"]["name"];`,
      ");",
      "out center tags;",
    ].join("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    let response;
    try {
      response = await fetch(overpassEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`OpenStreetMap search failed with status ${response.status}.`);
    }
    const result = await response.json();
    if (!Array.isArray(result.elements)) {
      throw new Error("OpenStreetMap returned an unexpected response.");
    }

    const uniqueCafes = new Map();
    for (const element of result.elements) {
      const cafe = convertOverpassElement(element, userLocation);
      if (cafe && cafe.distance <= searchRadiusMeters) {
        uniqueCafes.set(cafe.id, cafe);
      }
    }
    cafes.splice(0, cafes.length, ...uniqueCafes.values());
    locationStatus.textContent =
      `Found ${cafes.length} named ${cafes.length === 1 ? "cafe" : "cafes"} within 1.5 km. ` +
      "Results are from OpenStreetMap and may not include every business.";
  } catch (error) {
    if (error.name === "AbortError") {
      locationStatus.textContent =
        "The OpenStreetMap search timed out. Its public service may be busy; please try again later.";
    } else if (typeof error?.code === "number") {
      locationStatus.textContent = getLocationError(error);
    } else if (error instanceof TypeError) {
      locationStatus.textContent =
        "Could not connect to OpenStreetMap. Check your internet connection and try again.";
      console.error("Could not connect to OpenStreetMap.", error);
    } else {
      locationStatus.textContent =
        "The nearby cafe search failed. Open the browser console for details and try again later.";
      console.error("Nearby cafe search failed.", error);
    }
  } finally {
    loading = false;
    locationButton.disabled = false;
    const locationIcon = document.createElement("span");
    locationIcon.setAttribute("aria-hidden", "true");
    locationIcon.textContent = "⌖";
    locationButton.replaceChildren(locationIcon, " Use my location");
    renderCafes();
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderCafes();
});
searchInput.addEventListener("input", () => {
  renderCafes();
  updateMapsSearchLink();
});
sortSelect.addEventListener("change", renderCafes);
for (const button of filterButtons) {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
}
document.querySelector("#saved-nav").addEventListener("click", (event) => {
  event.preventDefault();
  setActiveFilter("favorites");
  document.querySelector("#results-heading").scrollIntoView({ behavior: "smooth" });
});
locationButton.addEventListener("click", findNearbyCafes);
emptyAction.addEventListener("click", findNearbyCafes);
clearButton.addEventListener("click", clearFilters);

updateMapsSearchLink();
renderCafes();

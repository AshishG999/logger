export interface ParsedUA {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: string;
  deviceVendor: string;
  deviceModel: string;
  platform: string;
}

export function parseUserAgent(ua: string): ParsedUA {
  const result: ParsedUA = {
    browser: "Unknown",
    browserVersion: "",
    os: "Unknown",
    osVersion: "",
    deviceType: "desktop",
    deviceVendor: "",
    deviceModel: "",
    platform: "",
  };

  if (!ua) return result;

  const uaLower = ua.toLowerCase();

  // Browser detection
  if (uaLower.includes("firefox") && !uaLower.includes("seamonkey")) {
    result.browser = "Firefox";
    result.browserVersion = extractVersion(ua, /firefox\/([\d.]+)/);
  } else if (uaLower.includes("edg") || uaLower.includes("edge")) {
    result.browser = "Edge";
    result.browserVersion = extractVersion(ua, /edg[e]?\/([\d.]+)/);
  } else if (uaLower.includes("chrome") && !uaLower.includes("chromium") && !uaLower.includes("edg")) {
    result.browser = "Chrome";
    result.browserVersion = extractVersion(ua, /chrome\/([\d.]+)/);
  } else if ((uaLower.includes("safari") || uaLower.includes("webkit")) && !uaLower.includes("chrome") && !uaLower.includes("edg")) {
    result.browser = "Safari";
    result.browserVersion = extractVersion(ua, /version\/([\d.]+)/);
  } else if (uaLower.includes("chromium")) {
    result.browser = "Chromium";
    result.browserVersion = extractVersion(ua, /chromium\/([\d.]+)/);
  } else if (uaLower.includes("opera") || uaLower.includes("opr")) {
    result.browser = "Opera";
    result.browserVersion = extractVersion(ua, /(?:opera|opr)\/([\d.]+)/);
  } else if (uaLower.includes("msie") || uaLower.includes("trident")) {
    result.browser = "IE";
    result.browserVersion = extractVersion(ua, /(?:msie |rv:)([\d.]+)/);
  } else if (uaLower.includes("curl")) {
    result.browser = "curl";
    result.deviceType = "cli";
  } else if (uaLower.includes("wget")) {
    result.browser = "wget";
    result.deviceType = "cli";
  } else if (uaLower.includes("node")) {
    result.browser = "Node.js";
    result.deviceType = "cli";
  } else if (uaLower.includes("axios")) {
    result.browser = "Axios";
    result.deviceType = "cli";
  } else if (uaLower.includes("postman")) {
    result.browser = "Postman";
    result.deviceType = "cli";
  }

  // OS detection — mobile/tablet first (they often contain desktop strings)
  if (uaLower.includes("iphone") || uaLower.includes("ipad")) {
    result.os = "iOS";
    result.platform = "iOS";
    result.osVersion = extractVersion(ua, /(?:iphone |ipad )os ([\d_]+)/).replace(/_/g, ".");
  } else if (uaLower.includes("android") && !uaLower.includes("windows")) {
    result.os = "Android";
    result.platform = "Android";
    result.osVersion = extractVersion(ua, /android ([\d.]+)/);
  } else if (uaLower.includes("windows")) {
    result.os = "Windows";
    if (uaLower.includes("nt 10")) result.osVersion = "10";
    else if (uaLower.includes("nt 6.3")) result.osVersion = "8.1";
    else if (uaLower.includes("nt 6.2")) result.osVersion = "8";
    else if (uaLower.includes("nt 6.1")) result.osVersion = "7";
    else if (uaLower.includes("nt 6.0")) result.osVersion = "Vista";
    else if (uaLower.includes("nt 5.1")) result.osVersion = "XP";
    result.platform = "Windows";
  } else if (uaLower.includes("mac os") || uaLower.includes("macintosh")) {
    result.os = "macOS";
    const match = ua.match(/mac os x ([\d_.]+)/);
    if (match) result.osVersion = match[1].replace(/_/g, ".");
    result.platform = "macOS";
  } else if (uaLower.includes("linux")) {
    result.os = "Linux";
    result.platform = "Linux";
  } else if (uaLower.includes("crkey")) {
    result.os = "ChromeOS";
    result.platform = "ChromeOS";
  }

  // Device type detection
  if (uaLower.includes("mobile") || uaLower.includes("iphone") || uaLower.includes("android")) {
    result.deviceType = "mobile";
  } else if (uaLower.includes("tablet") || uaLower.includes("ipad") || uaLower.includes("playbook")) {
    result.deviceType = "tablet";
  } else if (uaLower.includes("tv") || uaLower.includes("smart-tv")) {
    result.deviceType = "tv";
  } else if (uaLower.includes("watch") || uaLower.includes("wearable")) {
    result.deviceType = "wearable";
  } else if (uaLower.includes("bot") || uaLower.includes("crawler") || uaLower.includes("spider")) {
    result.deviceType = "bot";
  } else if (uaLower.includes("cli") || uaLower.includes("curl") || uaLower.includes("wget") || uaLower.includes("httpie")) {
    result.deviceType = "cli";
  }

  // Device vendor/model
  if (uaLower.includes("iphone")) {
    result.deviceVendor = "Apple";
    result.deviceModel = "iPhone";
  } else if (uaLower.includes("ipad")) {
    result.deviceVendor = "Apple";
    result.deviceModel = "iPad";
  } else if (uaLower.includes("macintosh") || uaLower.includes("mac ")) {
    result.deviceVendor = "Apple";
    result.deviceModel = "Mac";
  } else if (uaLower.includes("samsung") || uaLower.includes("sm-")) {
    result.deviceVendor = "Samsung";
  } else if (uaLower.includes("google pixel") || uaLower.includes("pixel ")) {
    result.deviceVendor = "Google";
    result.deviceModel = "Pixel";
  } else if (uaLower.includes("xiaomi") || uaLower.includes("mi ")) {
    result.deviceVendor = "Xiaomi";
  } else if (uaLower.includes("oneplus")) {
    result.deviceVendor = "OnePlus";
  }

  // Extract model from device identifiers in brackets (mobile/tablet only)
  if (!result.deviceModel && (result.deviceType === "mobile" || result.deviceType === "tablet")) {
    const modelMatch = ua.match(/\(([^;)]+)/);
    if (modelMatch) {
      const modelPart = modelMatch[1].trim().split(";")[0]?.trim();
      if (modelPart && modelPart.length < 30 && !modelPart.toLowerCase().includes("linux")) {
        result.deviceModel = modelPart;
      }
    }
  }

  return result;
}

function extractVersion(ua: string, regex: RegExp): string {
  const match = ua.match(regex);
  if (match?.[1]) return match[1].replace(/_/g, ".");
  return "";
}

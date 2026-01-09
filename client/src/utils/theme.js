export function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }
  
  export function getCurrentTheme() {
    return localStorage.getItem("theme") || "light";
  }
  
  setTheme(getCurrentTheme());
  
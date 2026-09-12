# Roadmap

## Futuras Implementaciones

### Detección de Tecnologías (Passive Fingerprinting)
Implementar un sistema de análisis no intrusivo para identificar las tecnologías utilizadas por los dominios observados.
- **Herramientas:** Integración con librerías como `Wappalyzer` (versión python o wrapper) o análisis directo de headers HTTP (Server, X-Powered-By, Cookies).
- **Objetivo:** Determinar CMS (WordPress, Joomla, etc.), servidores web (Nginx, Apache) y frameworks sin realizar escaneos agresivos.
- **Implementación:** Crear un script en `scripts/fingerprinting.py` que, dado un dominio, realice una petición GET estándar y analice la respuesta.

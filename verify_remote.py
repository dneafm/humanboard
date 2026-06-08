import app, comic_engine
# Check reclean endpoint exists
import inspect
src = inspect.getsource(app.DashboardHandler.do_POST)
assert '/api/assets/reclean' in src, 'reclean endpoint missing from app.py'
print('app.py reclean endpoint: OK')

# Check backend dispatch includes openai
src2 = inspect.getsource(comic_engine.generate_panels_for_episode)
assert 'openai' in src2.lower(), 'openai backend missing from comic_engine'
print('comic_engine openai dispatch: OK')

# Check openai_helper importable
from openai_helper import OpenAIHelper
print('openai_helper import: OK')

# Check Pillow
from PIL import Image
print('Pillow: OK')

print('\nAll remote checks passed!')

import sys
from face2face import Face2Face

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

f2f = Face2Face()
print("Face2Face instance dir:")
for attr in dir(f2f):
    if not attr.startswith('_'):
        print(f"  {attr}: {type(getattr(f2f, attr))}")
